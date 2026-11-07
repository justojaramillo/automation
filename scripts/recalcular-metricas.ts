// Recalcula las métricas de un lote a partir de su cola y de sus facturas (para lotes procesados antes de que
// existieran los contadores, o si alguna vez se desincronizan). Solo escribe el campo `metricas` de ese lote.
//   npx tsx scripts/recalcular-metricas.ts <idLote>
import { firestore } from "../src/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Factura } from "../src/lib/modelo/tipos";
import { metricasDesdeEventos, type EventoMetrica } from "../src/lib/procesamiento/metricas";
import { colaArchivos } from "../src/lib/procesamiento/cola";
import { refProceso } from "../src/lib/procesamiento/proceso";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("Uso: recalcular-metricas.ts <idLote>");
  const db = firestore();
  const archivos = (await colaArchivos(id).get()).docs.map((d) => d.data() as ArchivoCola);
  const eventos: EventoMetrica[] = [];
  for (const a of archivos) {
    if (a.resultado === "duplicada") { eventos.push({ tipo: "duplicada" }); continue; }
    if (a.resultado === "error") { eventos.push({ tipo: "error" }); continue; }
    if ((a.resultado !== "aceptada" && a.resultado !== "revision") || !a.hashArchivo) continue;
    const f = (await db.collection(COLECCIONES.facturas).doc(a.hashArchivo).get()).data() as Factura | undefined;
    if (!f) continue;
    eventos.push({
      tipo: "factura", estado: f.estado, subtotal: f.subtotal, iva: f.iva, impoconsumo: f.impoconsumo, total: f.total,
      clienteNuevo: a.clienteNuevo, nitProveedor: f.nitProveedor, proveedor: f.proveedor,
    });
  }
  const m = metricasDesdeEventos(eventos);
  await refProceso(id).update({ metricas: m });
  console.log(`Lote ${id}: ${archivos.length} archivos → aceptadas ${m.aceptadas.n}, revisión ${m.revision.n}, errores ${m.errores}, duplicadas ${m.duplicadas}, total aceptado ${m.aceptadas.total}`);
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
