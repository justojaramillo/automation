// Prueba de extremo a extremo del servidor (sin HTTP ni login): sube imágenes a Blob, crea la cola,
// procesa con N lotes concurrentes, genera el Excel, repite con otra ruta (idempotencia) y LIMPIA.
//   npx tsx scripts/probar-pipeline.ts salida/facturas salida/verdad.json [cantidad] [--conservar]
// Cuota Firestore: imprime un conteo aproximado de lecturas/escrituras.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { AggregateField, Timestamp } from "firebase-admin/firestore";
import { del, get, list, put } from "@vercel/blob";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

import { firestore } from "../src/lib/firebase/admin";
import { pathnameDeSubida } from "../src/lib/rutas";
import { COLECCIONES, type Factura, type Proceso } from "../src/lib/modelo/tipos";
import { iniciarProceso } from "../src/lib/procesamiento/iniciar";
import { finalizarProceso } from "../src/lib/procesamiento/finalizar";
import { procesarLote, type ResumenLote } from "../src/lib/procesamiento/lote";
import { calcularAvance } from "../src/lib/procesamiento/avance";
import { refProceso } from "../src/lib/procesamiento/proceso";

const UID = "prueba-pipeline";
const CONCURRENCIA = 3;

async function ejecutarProceso(nombre: string, carpeta: string, archivos: string[]): Promise<{ id: string; lotes: ResumenLote[]; segundos: number }> {
  const db = firestore();
  const proceso: Proceso = { uid: UID, carpeta: nombre, estado: "subiendo", totalArchivos: 0, inicio: Timestamp.now(), fin: null, rutaExcel: null };
  const id = (await db.collection(COLECCIONES.procesos).add(proceso)).id;
  const t0 = Date.now();
  await Promise.all(archivos.map((a, i) =>
    put(pathnameDeSubida(id, i + 1, a), readFileSync(path.join(carpeta, a)), { access: "private", addRandomSuffix: false, allowOverwrite: true })));
  console.log(`[${nombre}] ${archivos.length} imágenes subidas a Blob en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await iniciarProceso(id);

  const lotes: ResumenLote[] = [];
  const t1 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
    for (;;) {
      const r = await procesarLote({ procesoId: id, uid: UID, tamano: 4, presupuestoMs: 200_000 });
      if (r.reclamados === 0) return;
      lotes.push(r);
    }
  }));
  const segundos = (Date.now() - t1) / 1000;
  const fin = await finalizarProceso(id);
  console.log(`[${nombre}] procesado en ${segundos.toFixed(1)} s, finalizar:`, JSON.stringify(fin));
  return { id, lotes, segundos };
}

async function limpiar(ids: string[]): Promise<void> {
  const db = firestore();
  for (const id of ids) {
    const f = await db.collection(COLECCIONES.facturas).where("procesoId", "==", id).get();
    for (const d of f.docs) {
      const x = d.data() as Factura;
      if (x.numero) await db.collection(COLECCIONES.indicesNumero).doc(x.numero).delete();
      if (x.clienteDocumento) await db.collection(COLECCIONES.clientes).doc(x.clienteDocumento).delete();
      await d.ref.delete();
    }
    await db.recursiveDelete(refProceso(id));
    for (let c: string | undefined; ;) {
      const p = await list({ prefix: `procesos/${id}/`, cursor: c });
      if (p.blobs.length) await del(p.blobs.map((b) => b.pathname));
      if (!p.hasMore) break;
      c = p.cursor;
    }
  }
}

async function main(): Promise<void> {
  const [carpeta, verdadPath, cantidadArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const conservar = process.argv.includes("--conservar");
  const verdad = JSON.parse(readFileSync(verdadPath, "utf8")) as { facturas: { archivo: string; total: number; cliente: { documento: string } }[] };
  const archivos = readdirSync(carpeta).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().slice(0, cantidadArg ? Number(cantidadArg) : undefined);
  const esperadoTotal = verdad.facturas.filter((f) => archivos.includes(f.archivo)).reduce((a, f) => a + f.total, 0);
  const clientesEsperados = new Set(verdad.facturas.filter((f) => archivos.includes(f.archivo)).map((f) => f.cliente.documento)).size;
  const ids: string[] = [];
  const previas = (await firestore().collection(COLECCIONES.facturas).count().get()).data().count;
  if (previas > 0) { console.error(`La colección facturas ya tiene ${previas} documentos: la prueba de sum() y la limpieza serían ambiguas. Abortando.`); process.exit(1); }
  try {
    const A = await ejecutarProceso("prueba-A", carpeta, archivos);
    ids.push(A.id);
    const db = firestore();
    const facturasA = await db.collection(COLECCIONES.facturas).where("procesoId", "==", A.id).get();
    const avanceA = await calcularAvance(A.id);
    const tiempos = A.lotes.flatMap((l) => l.detalle.map((d) => d.ms));
    console.log(`\n== Proceso A ==\nfacturas en BD: ${facturasA.size} (esperadas ${archivos.length}) | aceptadas ${avanceA.aceptadas}, revisión ${avanceA.revision}, duplicadas ${avanceA.duplicadas}, errores ${avanceA.errores}`);
    console.log(`clientes nuevos: ${avanceA.clientesNuevos} (esperados ${clientesEsperados} distintos)`);
    console.log(`tiempo por archivo: media ${(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000).toFixed(1)} s, máx ${(Math.max(...tiempos) / 1000).toFixed(1)} s | total ${A.segundos.toFixed(1)} s con ${CONCURRENCIA} lotes concurrentes`);

    // Excel: la suma de la columna Total debe coincidir con la base de datos y con la verdad.
    const procA = (await refProceso(A.id).get()).data() as Proceso;
    const blob = await get(procA.rutaExcel!, { access: "private", useCache: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await new Response(blob!.stream).arrayBuffer()) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Facturas")!;
    let sumaExcel = 0; let celdasNumericas = true;
    ws.eachRow((row, n) => { if (n > 1) { const v = row.getCell("K").value; if (typeof v === "number") sumaExcel += v; else celdasNumericas = false; } });
    // sum() sobre TODA la colección (un filtro por procesoId pediría un índice compuesto). Válido porque en la prueba solo están estas facturas.
    const sumaBD = (await db.collection(COLECCIONES.facturas).aggregate({ s: AggregateField.sum("total") }).get()).data().s;
    console.log(`Excel ${procA.rutaExcel}: hojas ${wb.worksheets.map((w) => w.name).join(", ")} | filas facturas ${ws.rowCount - 1}`);
    console.log(`suma Total: Excel ${sumaExcel} | Firestore sum() ${sumaBD} | verdad ${esperadoTotal} | celdas numéricas: ${celdasNumericas} → ${sumaExcel === sumaBD ? "COINCIDEN (Excel = BD)" : "NO COINCIDEN"}`);

    // Idempotencia: las mismas imágenes con OTRA ruta de Blob no deben duplicar nada.
    const antesF = (await db.collection(COLECCIONES.facturas).count().get()).data().count;
    const antesC = (await db.collection(COLECCIONES.clientes).count().get()).data().count;
    const B = await ejecutarProceso("prueba-B", carpeta, archivos);
    ids.push(B.id);
    const despuesF = (await db.collection(COLECCIONES.facturas).count().get()).data().count;
    const despuesC = (await db.collection(COLECCIONES.clientes).count().get()).data().count;
    const avanceB = await calcularAvance(B.id);
    console.log(`\n== Reproceso B (mismas imágenes, otra ruta) ==\nduplicadas ${avanceB.duplicadas} de ${archivos.length} | facturas ${antesF} → ${despuesF} | clientes ${antesC} → ${despuesC} → ${despuesF === antesF && despuesC === antesC ? "IDEMPOTENTE (no se duplicó nada)" : "¡SE DUPLICÓ ALGO!"}`);
  } finally {
    if (conservar) console.log("\n--conservar: no se limpia. Procesos:", ids.join(", "));
    else { await limpiar(ids); console.log("\nDatos de prueba eliminados de Firestore y Blob."); }
  }
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
