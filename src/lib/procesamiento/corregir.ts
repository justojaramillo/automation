// Revisión manual de UNA factura, en una transacción de Firestore (lecturas antes de escrituras):
//   factura → estado «aceptada» con los datos de la persona · índice del número · cliente nuevo (si su
//   documento pasa el dígito de verificación) · contadores del lote. Queda constancia de quién la corrigió,
//   qué decía la máquina y qué validaciones se ignoraron.

import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Cliente, type Factura, type IndiceNumero } from "@/lib/modelo/tipos";
import { dvValido } from "@/lib/ocr/nit";
import { validar } from "@/lib/ocr/validador";
import { aParcial, type DatosManuales } from "./correccion";
import { cambiosManual, type ImportesManual } from "./metricas";
import { aplicarCambios } from "./metricas-firestore";
import { refProceso } from "./proceso";

export type ResultadoCorreccion =
  | { ok: true; ignoradas: string[]; clienteNuevo: boolean }
  | { ok: false; status: 404 | 409 | 422; error: string; motivos?: string[] };

const importesDe = (f: Pick<Factura, "subtotal" | "iva" | "impoconsumo" | "total" | "nitProveedor" | "proveedor">): ImportesManual => ({
  subtotal: f.subtotal ?? 0, iva: f.iva ?? 0, impoconsumo: f.impoconsumo ?? 0, total: f.total ?? 0,
  nitProveedor: f.nitProveedor, proveedor: f.proveedor,
});

export async function corregirFactura(o: { hash: string; uid: string; email: string; datos: DatosManuales; confirmado: boolean }): Promise<ResultadoCorreccion> {
  const d = o.datos;
  // Las MISMAS reglas que las del OCR. Si algo no cuadra, la persona debe confirmar que revisó la imagen.
  const motivos = validar(aParcial(d));
  if (motivos.length > 0 && !o.confirmado) {
    return { ok: false, status: 422, error: "Algunas validaciones no cuadran", motivos };
  }

  const db = firestore();
  const refFactura = db.collection(COLECCIONES.facturas).doc(o.hash);
  const refIndiceNuevo = db.collection(COLECCIONES.indicesNumero).doc(d.numero);
  // El cliente solo se crea si su documento pasa el dígito de verificación (nunca clientes inventados).
  const docCliente = dvValido(d.clienteDocumento, d.clienteDv) ? d.clienteDocumento : null;
  const refCliente = docCliente ? db.collection(COLECCIONES.clientes).doc(docCliente) : null;

  return db.runTransaction(async (tx): Promise<ResultadoCorreccion> => {
    const sFactura = await tx.get(refFactura);
    if (!sFactura.exists || (sFactura.data() as Factura).uid !== o.uid) return { ok: false, status: 404, error: "Factura no encontrada" };
    const f = sFactura.data() as Factura;
    if (f.estado !== "revision" && !f.corregidaManualmente) {
      return { ok: false, status: 409, error: "Esta factura ya la aceptó la máquina: no necesita revisión" };
    }
    const refIndiceViejo = f.numero && f.numero !== d.numero ? db.collection(COLECCIONES.indicesNumero).doc(f.numero) : null;

    // ── lecturas ──
    const [sIndiceNuevo, sIndiceViejo, sCliente, sProceso] = await Promise.all([
      tx.get(refIndiceNuevo),
      refIndiceViejo ? tx.get(refIndiceViejo) : Promise.resolve(null),
      refCliente ? tx.get(refCliente) : Promise.resolve(null),
      tx.get(refProceso(f.procesoId)),
    ]);
    if (sIndiceNuevo.exists && (sIndiceNuevo.data() as IndiceNumero).hashArchivo !== o.hash) {
      return { ok: false, status: 409, error: `El número ${d.numero} ya existe en otra factura` };
    }

    // ── escrituras ──
    const primeraVez = !f.corregidaManualmente;
    const clienteNuevo = Boolean(refCliente && sCliente && !sCliente.exists);
    tx.update(refFactura, {
      numero: d.numero, fecha: d.fecha, proveedor: d.proveedor, nitProveedor: d.nitProveedor, dvProveedor: d.dvProveedor,
      clienteDocumento: docCliente, clienteDocumentoLeido: d.clienteDocumento, clienteDv: d.clienteDv, clienteNombre: d.clienteNombre || null,
      items: d.items, subtotal: d.subtotal, iva: d.iva, impoconsumo: d.impoconsumo, total: d.total,
      estado: "aceptada", motivos: [], validacionesIgnoradas: motivos,
      corregidaManualmente: true, corregidaPor: o.email, corregidaEn: Timestamp.now(),
      ...(primeraVez ? { motivosOriginales: f.motivos } : {}),
    });
    if (!sIndiceNuevo.exists) tx.create(refIndiceNuevo, { hashArchivo: o.hash } satisfies IndiceNumero);
    if (refIndiceViejo && sIndiceViejo?.exists && (sIndiceViejo.data() as IndiceNumero).hashArchivo === o.hash) tx.delete(refIndiceViejo);
    if (clienteNuevo && refCliente) {
      const cliente: Cliente = { documento: d.clienteDocumento, dv: d.clienteDv, nombre: d.clienteNombre, creadoEn: Timestamp.now(), primerProcesoId: f.procesoId };
      tx.create(refCliente, cliente);
    }
    if (sProceso.exists) {
      aplicarCambios(tx, f.procesoId, cambiosManual(
        { ...importesDe({ ...d, nitProveedor: d.nitProveedor, proveedor: d.proveedor }), clienteNuevo },
        primeraVez ? undefined : importesDe(f),
      ));
    }
    return { ok: true, ignoradas: motivos, clienteNuevo };
  });
}
