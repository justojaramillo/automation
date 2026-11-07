// Prueba de integración (Firestore real) de la REVISIÓN MANUAL: la transacción que corrige una factura
// dudosa y sus efectos (factura, índice del número, cliente, contadores del lote). Limpia lo que crea.
//   npx tsx scripts/probar-correccion.ts salida/verdad_1000.json
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Timestamp } from "firebase-admin/firestore";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

import { firestore } from "../src/lib/firebase/admin";
import { COLECCIONES, TERMINADO, type ArchivoCola, type Factura, type Metricas, type Proceso } from "../src/lib/modelo/tipos";
import { colaArchivos } from "../src/lib/procesamiento/cola";
import type { DatosManuales } from "../src/lib/procesamiento/correccion";
import { corregirFactura } from "../src/lib/procesamiento/corregir";
import { guardarFactura, guardarFallo } from "../src/lib/procesamiento/guardar";
import { calcularTasas, sumarMetricas } from "../src/lib/procesamiento/metricas";
import { refProceso } from "../src/lib/procesamiento/proceso";
import type { ParcialFactura } from "../src/lib/ocr/tipos";
import { limpiarLotes } from "./limpiar-lotes";

interface Verdad { facturas: { archivo: string; numero: string; fecha: string; proveedor: { nombre: string; nit: string; dv: number }; cliente: { documento: string; dv: number; nombre: string };
  items: { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }[]; subtotal: number; iva: number; impoconsumo: number; total: number }[] }

const UID = "prueba-correccion";
const EMAIL = "prueba@ejemplo.com";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
let fallos = 0;
const chequear = (titulo: string, ok: boolean, detalle = "") => { console.log(`  ${ok ? "✓" : "✗"} ${titulo}${ok || !detalle ? "" : ` — ${detalle}`}`); if (!ok) fallos++; };

async function main(): Promise<void> {
  const verdad = JSON.parse(readFileSync(process.argv[2], "utf8")) as Verdad;
  const [v1, v2, v3] = verdad.facturas;
  const aDatos = (v: Verdad["facturas"][number]): DatosManuales => ({
    numero: v.numero, fecha: v.fecha, proveedor: v.proveedor.nombre, nitProveedor: v.proveedor.nit, dvProveedor: v.proveedor.dv,
    clienteDocumento: v.cliente.documento, clienteDv: v.cliente.dv, clienteNombre: v.cliente.nombre,
    items: v.items.map(({ descripcion, cantidad, precioUnitario, subtotal }) => ({ descripcion, cantidad, precioUnitario, subtotal })),
    subtotal: v.subtotal, iva: v.iva, impoconsumo: v.impoconsumo, total: v.total,
  });
  const parcialDe = (v: Verdad["facturas"][number], sinCliente: boolean): ParcialFactura => ({
    numero: v.numero, fecha: v.fecha, proveedor: v.proveedor.nombre, nitProveedor: v.proveedor.nit, dvProveedor: v.proveedor.dv,
    clienteDocumento: sinCliente ? null : v.cliente.documento, clienteDv: sinCliente ? null : v.cliente.dv, clienteNombre: v.cliente.nombre,
    items: aDatos(v).items, subtotal: v.subtotal, iva: v.iva, impoconsumo: v.impoconsumo > 0 ? v.impoconsumo : null, mencionaImpoconsumo: v.impoconsumo > 0, total: v.total,
  });

  const db = firestore();
  const previas = (await db.collection(COLECCIONES.clientes).where("documento", "in", [v1.cliente.documento, v2.cliente.documento, v3.cliente.documento]).get()).size;
  if (previas > 0) { console.error("Ya existen clientes de estas facturas en la base: la prueba sería ambigua. Abortando."); process.exit(1); }
  const proceso: Proceso = { uid: UID, carpeta: "prueba-correccion", estado: "terminado", totalArchivos: 3, inicio: Timestamp.now(), fin: Timestamp.now(), rutaExcel: null };
  const procesoId = (await db.collection(COLECCIONES.procesos).add(proceso)).id;
  try {
    // Preparación: 3 archivos en la cola. A: error del OCR (factura vacía) · B: en revisión con datos parciales · C: aceptada por la máquina.
    const hashes = { a: sha(`a-${procesoId}`), b: sha(`b-${procesoId}`), c: sha(`c-${procesoId}`) };
    const archivo = (nombre: string): ArchivoCola => ({ blobPathname: `procesos/${procesoId}/${nombre}`, nombre, estado: "procesando", resultado: null, clienteNuevo: false, intentos: 1, error: null, disponibleDesde: TERMINADO });
    for (const n of ["a.png", "b.png", "c.png"]) await colaArchivos(procesoId).doc(n).set(archivo(n));
    const base = { procesoId, uid: UID, nombre: "x.png", blobPathname: "x" };
    await guardarFallo({ ...base, archivoId: "a.png", hash: hashes.a, error: "OCR sin texto" });
    await guardarFactura({ ...base, archivoId: "b.png", hash: hashes.b, parcial: parcialDe(v2, true), motivos: ["Falta el documento del cliente"], confianza: 70 });
    await guardarFactura({ ...base, archivoId: "c.png", hash: hashes.c, parcial: parcialDe(v3, false), motivos: [], confianza: 95 });
    const metricas = async (): Promise<Metricas> => sumarMetricas([((await refProceso(procesoId).get()).data() as Proceso).metricas]);
    const factura = async (h: string) => (await db.collection(COLECCIONES.facturas).doc(h).get()).data() as Factura;
    const m0 = await metricas();
    console.log(`Preparación: errores ${m0.errores}, revisión ${m0.revision.n}, aceptadas ${m0.aceptadas.n}, manuales ${m0.manuales.n}`);

    console.log("\n1. Validación: datos con un total que no cuadra");
    let r = await corregirFactura({ hash: hashes.a, uid: UID, email: EMAIL, datos: { ...aDatos(v1), total: v1.total + 1000 }, confirmado: false });
    chequear("se rechaza con 422 y lista los motivos", !r.ok && r.status === 422 && (r.motivos ?? []).some((m) => /total/.test(m)));
    chequear("no se escribió nada (sigue en revisión)", (await factura(hashes.a)).estado === "revision");

    console.log("\n2. Factura A (error del OCR): se ingresa a mano con datos correctos");
    r = await corregirFactura({ hash: hashes.a, uid: UID, email: EMAIL, datos: aDatos(v1), confirmado: false });
    chequear("se guarda", r.ok, JSON.stringify(r));
    const fa = await factura(hashes.a);
    chequear("estado «aceptada», marcada como corregida a mano por el correo", fa.estado === "aceptada" && fa.corregidaManualmente === true && fa.corregidaPor === EMAIL);
    chequear("conserva lo que decía la máquina", (fa.motivosOriginales ?? []).some((m) => /No se pudo procesar/.test(m)));
    chequear("tiene sus datos, ítems y totales", fa.numero === v1.numero && fa.total === v1.total && fa.items.length === v1.items.length);
    chequear("creó el índice del número", (await db.collection(COLECCIONES.indicesNumero).doc(v1.numero).get()).data()?.hashArchivo === hashes.a);
    chequear("creó el cliente (su documento pasa el dígito de verificación)", (await db.collection(COLECCIONES.clientes).doc(v1.cliente.documento).get()).exists);
    let m = await metricas();
    chequear("contadores: manuales 1 con sus importes", m.manuales.n === 1 && m.manuales.total === v1.total && m.manuales.subtotal === v1.subtotal && m.manuales.iva === v1.iva);
    chequear("contadores: aparece en el proveedor y suma un cliente nuevo", m.proveedores[v1.proveedor.nit]?.n === 1 && m.clientesNuevos >= 1);
    chequear("las métricas de la MÁQUINA no cambian", m.errores === m0.errores && m.revision.n === m0.revision.n && m.aceptadas.n === m0.aceptadas.n);

    console.log("\n3. Volver a editar la misma factura: solo la diferencia");
    const editada = { ...aDatos(v1), items: [{ ...aDatos(v1).items[0], cantidad: aDatos(v1).items[0].cantidad + 1, subtotal: aDatos(v1).items[0].subtotal + aDatos(v1).items[0].precioUnitario }, ...aDatos(v1).items.slice(1)] };
    r = await corregirFactura({ hash: hashes.a, uid: UID, email: EMAIL, datos: { ...editada, subtotal: v1.subtotal + 1, total: v1.total }, confirmado: true });
    chequear("se guarda con confirmación (validaciones que no cuadran)", r.ok && r.ignoradas.length > 0, JSON.stringify(r));
    chequear("registra qué validaciones ignoró la persona", ((await factura(hashes.a)).validacionesIgnoradas ?? []).length > 0);
    const m2 = await metricas();
    chequear("manuales sigue en 1 factura (no se suma otra)", m2.manuales.n === 1, `n=${m2.manuales.n}`);
    chequear("el subtotal cambió solo en la diferencia (+1)", m2.manuales.subtotal === m.manuales.subtotal + 1, `${m.manuales.subtotal} → ${m2.manuales.subtotal}`);

    console.log("\n4. Número de factura repetido en otra factura");
    r = await corregirFactura({ hash: hashes.b, uid: UID, email: EMAIL, datos: { ...aDatos(v2), numero: v1.numero }, confirmado: true });
    chequear("se rechaza con 409", !r.ok && r.status === 409 && /ya existe/.test(r.error), JSON.stringify(r));

    console.log("\n5. Factura B (en revisión con datos parciales): se completa el cliente");
    r = await corregirFactura({ hash: hashes.b, uid: UID, email: EMAIL, datos: aDatos(v2), confirmado: false });
    chequear("se guarda", r.ok, JSON.stringify(r));
    chequear("el cliente existe y la factura apunta a él", (await factura(hashes.b)).clienteDocumento === v2.cliente.documento && (await db.collection(COLECCIONES.clientes).doc(v2.cliente.documento).get()).exists);
    m = await metricas();
    const t = calcularTasas(m);
    chequear("manuales = 2 y no quedan pendientes (errores + revisión − manuales)", m.manuales.n === 2 && t.pendientes === 0, `manuales ${m.manuales.n}, pendientes ${t.pendientes}`);

    console.log("\n6. Casos que deben rechazarse");
    r = await corregirFactura({ hash: hashes.c, uid: UID, email: EMAIL, datos: aDatos(v3), confirmado: true });
    chequear("una factura que la máquina ya aceptó: 409", !r.ok && r.status === 409);
    r = await corregirFactura({ hash: hashes.a, uid: "otro-usuario", email: "x@y.z", datos: aDatos(v1), confirmado: true });
    chequear("la factura de otro usuario: 404", !r.ok && r.status === 404);
    r = await corregirFactura({ hash: sha("no-existe"), uid: UID, email: EMAIL, datos: aDatos(v1), confirmado: true });
    chequear("una factura inexistente: 404", !r.ok && r.status === 404);

    console.log("\n7. Cambiar el número de una factura ya corregida libera el índice anterior");
    const nuevoNumero = "FE-999001";
    r = await corregirFactura({ hash: hashes.a, uid: UID, email: EMAIL, datos: { ...aDatos(v1), numero: nuevoNumero }, confirmado: false });
    chequear("se guarda", r.ok, JSON.stringify(r));
    chequear("el índice viejo se borró y el nuevo apunta a la factura", !(await db.collection(COLECCIONES.indicesNumero).doc(v1.numero).get()).exists && (await db.collection(COLECCIONES.indicesNumero).doc(nuevoNumero).get()).data()?.hashArchivo === hashes.a);
    await db.collection(COLECCIONES.indicesNumero).doc(nuevoNumero).delete(); // lo creó esta prueba: el limpiador no lo conoce
  } finally {
    await limpiarLotes([procesoId]);
    console.log("\nDatos de prueba eliminados.");
  }
  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} comprobación(es) fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
