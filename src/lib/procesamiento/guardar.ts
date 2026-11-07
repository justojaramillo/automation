// Guardado de UNA factura en una transacción de Firestore (todas las lecturas antes de las escrituras).
//   · facturas/{hash}: el mismo archivo nunca se guarda dos veces.
//   · indices_numero/{numero}: hace único el número de factura.
//   · clientes/{documento}: el ID es el documento → imposible duplicar, ni con lotes concurrentes.
// Un cliente se crea SOLO si su documento pasa el dígito de verificación; nunca se sobrescribe el nombre.

import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, TERMINADO, type Cliente, type Factura, type ResultadoArchivo } from "@/lib/modelo/tipos";
import { dvValido } from "@/lib/ocr/nit";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import { colaArchivos } from "./cola";

export interface EntradaGuardado {
  procesoId: string;
  uid: string;
  archivoId: string;
  nombre: string;
  blobPathname: string;
  hash: string;
  parcial: ParcialFactura;
  motivos: string[];
  confianza: number;
}

export async function guardarFactura(e: EntradaGuardado): Promise<ResultadoArchivo> {
  const db = firestore();
  const refFactura = db.collection(COLECCIONES.facturas).doc(e.hash);
  const refArchivo = colaArchivos(e.procesoId).doc(e.archivoId);
  const p = e.parcial;
  const docCliente = p.clienteDocumento && p.clienteDv !== null && dvValido(p.clienteDocumento, p.clienteDv) ? p.clienteDocumento : null;
  const refIndice = p.numero ? db.collection(COLECCIONES.indicesNumero).doc(p.numero) : null;
  const refCliente = docCliente ? db.collection(COLECCIONES.clientes).doc(docCliente) : null;

  return db.runTransaction(async (tx) => {
    // ── lecturas ──
    const [sFactura, sIndice, sCliente] = await Promise.all([
      tx.get(refFactura),
      refIndice ? tx.get(refIndice) : Promise.resolve(null),
      refCliente ? tx.get(refCliente) : Promise.resolve(null),
    ]);

    // Mismo archivo ya guardado (reprocesar la misma carpeta): no se duplica nada.
    if (sFactura.exists) {
      tx.update(refArchivo, { estado: "ok", resultado: "duplicada", clienteNuevo: false, clienteExistente: false, hashArchivo: e.hash, error: null, disponibleDesde: TERMINADO });
      return "duplicada";
    }

    // ── escrituras ──
    const motivos = [...e.motivos];
    let indexar = Boolean(refIndice);
    if (sIndice?.exists) {
      // Otro archivo (distinto) ya usa este número: no se descarta (podría ser un error del OCR); queda en revisión.
      motivos.push(`El número ${p.numero} ya existe en otra factura`);
      indexar = false;
    }
    if (docCliente === null && p.clienteDocumento && !motivos.some((m) => m.includes("cliente"))) {
      motivos.push("El documento del cliente no es válido");
    }

    let clienteNuevo = false;
    if (refCliente && sCliente && !sCliente.exists) {
      const cliente: Cliente = {
        documento: docCliente!,
        dv: p.clienteDv!,
        nombre: p.clienteNombre ?? "",
        creadoEn: Timestamp.now(),
        primerProcesoId: e.procesoId,
      };
      tx.create(refCliente, cliente);
      clienteNuevo = true;
    }

    const estado = motivos.length === 0 ? "aceptada" : "revision";
    const factura: Factura = {
      numero: p.numero,
      fecha: p.fecha,
      proveedor: p.proveedor,
      nitProveedor: p.nitProveedor,
      clienteDocumento: docCliente,
      clienteNombre: p.clienteNombre,
      subtotal: p.subtotal,
      iva: p.iva,
      impoconsumo: p.impoconsumo ?? 0,
      total: p.total,
      estado,
      motivos,
      archivo: e.nombre,
      blobPathname: e.blobPathname,
      confianzaOcr: Math.round(e.confianza),
      procesoId: e.procesoId,
      uid: e.uid,
      creadoEn: Timestamp.now(),
      items: p.items,
    };
    tx.create(refFactura, factura);
    if (indexar && refIndice) tx.create(refIndice, { hashArchivo: e.hash });
    tx.update(refArchivo, { estado: "ok", resultado: estado, clienteNuevo, clienteExistente: Boolean(sCliente?.exists), hashArchivo: e.hash, error: null, disponibleDesde: TERMINADO });
    return estado;
  });
}

/** Tras agotar los intentos: la factura queda en revisión con el motivo (no se pierde). */
export async function guardarFallo(e: Omit<EntradaGuardado, "parcial" | "motivos" | "confianza"> & { error: string }): Promise<void> {
  const db = firestore();
  const refFactura = db.collection(COLECCIONES.facturas).doc(e.hash);
  const refArchivo = colaArchivos(e.procesoId).doc(e.archivoId);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(refFactura);
    if (!s.exists) {
      const factura: Factura = {
        numero: null, fecha: null, proveedor: null, nitProveedor: null, clienteDocumento: null, clienteNombre: null,
        subtotal: null, iva: null, impoconsumo: 0, total: null, estado: "revision",
        motivos: [`No se pudo procesar el archivo: ${e.error}`],
        archivo: e.nombre, blobPathname: e.blobPathname, confianzaOcr: 0, procesoId: e.procesoId, uid: e.uid,
        creadoEn: Timestamp.now(), items: [],
      };
      tx.create(refFactura, factura);
    }
    tx.update(refArchivo, { estado: "error", resultado: "error", clienteNuevo: false, hashArchivo: e.hash, error: e.error, disponibleDesde: TERMINADO });
  });
}

/**
 * Atajo previo al OCR: si la imagen (por su hash) ya está guardada, el archivo se marca `duplicada`
 * sin gastar CPU. Cuesta 1 lectura; reprocesar la misma carpeta pasa de minutos a segundos.
 */
export async function marcarDuplicadaSiExiste(procesoId: string, archivoId: string, hash: string): Promise<boolean> {
  const db = firestore();
  const refFactura = db.collection(COLECCIONES.facturas).doc(hash);
  const refArchivo = colaArchivos(procesoId).doc(archivoId);
  return db.runTransaction(async (tx) => {
    if (!(await tx.get(refFactura)).exists) return false;
    tx.update(refArchivo, { estado: "ok", resultado: "duplicada", clienteNuevo: false, clienteExistente: false, hashArchivo: hash, error: null, disponibleDesde: TERMINADO });
    return true;
  });
}
