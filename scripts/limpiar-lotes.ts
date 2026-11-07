// Borra SOLO los lotes indicados: sus facturas, el índice de cada número, los clientes de esas facturas,
// el lote (con su cola y métricas) y sus archivos de Blob. NO toca los demás lotes.
//   npx tsx scripts/limpiar-lotes.ts <idLote> [<idLote> ...]
import { del, list } from "@vercel/blob";
import { firestore } from "../src/lib/firebase/admin";
import { COLECCIONES, type Factura } from "../src/lib/modelo/tipos";
import { refProceso } from "../src/lib/procesamiento/proceso";

export async function limpiarLotes(ids: string[]): Promise<void> {
  try { process.loadEnvFile(".env"); } catch { /* sin .env */ }
  const db = firestore();
  for (const id of ids) {
    for (const d of (await db.collection(COLECCIONES.facturas).where("procesoId", "==", id).get()).docs) {
      const f = d.data() as Factura;
      if (f.numero) await db.collection(COLECCIONES.indicesNumero).doc(f.numero).delete();
      if (f.clienteDocumento) await db.collection(COLECCIONES.clientes).doc(f.clienteDocumento).delete();
      await d.ref.delete();
    }
    await db.recursiveDelete(refProceso(id));
    for (let c: string | undefined; ; ) {
      const p = await list({ prefix: `procesos/${id}/`, cursor: c });
      if (p.blobs.length) await del(p.blobs.map((b) => b.pathname));
      if (!p.hasMore) break;
      c = p.cursor;
    }
  }
}

if (process.argv[1]?.endsWith("limpiar-lotes.ts")) {
  const ids = process.argv.slice(2);
  if (ids.length === 0) { console.error("Uso: limpiar-lotes.ts <idLote> ..."); process.exit(1); }
  limpiarLotes(ids).then(() => { console.log(`Lotes eliminados: ${ids.length}`); process.exit(0); }).catch((e: unknown) => { console.error(e); process.exit(1); });
}
