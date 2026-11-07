// Cola de trabajo en Firestore (procesos/{id}/archivos). Un archivo se "reclama" con un
// ARRENDAMIENTO: disponibleDesde = ahora + 5 min. Si la función se cae, el arrendamiento caduca y
// el archivo vuelve a estar disponible. La consulta usa UN solo campo (sin índice compuesto).

import { firestore } from "@/lib/firebase/admin";
import { ARRENDAMIENTO_MS, COLECCIONES, TERMINADO, type ArchivoCola } from "@/lib/modelo/tipos";
import { refProceso } from "./proceso";

export const colaArchivos = (procesoId: string) => refProceso(procesoId).collection(COLECCIONES.archivos);

export interface ArchivoReclamado extends ArchivoCola {
  id: string;
}

/** Reclama hasta `n` archivos dentro de UNA transacción: dos invocaciones concurrentes nunca toman el mismo. */
export async function reclamar(procesoId: string, n: number): Promise<ArchivoReclamado[]> {
  const db = firestore();
  return db.runTransaction(async (tx) => {
    const ahora = Date.now();
    const consulta = colaArchivos(procesoId).where("disponibleDesde", "<=", ahora).orderBy("disponibleDesde").limit(n);
    const snap = await tx.get(consulta);
    const res: ArchivoReclamado[] = [];
    for (const doc of snap.docs) {
      const a = doc.data() as ArchivoCola;
      tx.update(doc.ref, { estado: "procesando", intentos: a.intentos + 1, disponibleDesde: ahora + ARRENDAMIENTO_MS });
      res.push({ ...a, id: doc.id, estado: "procesando", intentos: a.intentos + 1 });
    }
    return res;
  });
}

/** Devuelve un archivo a la cola (no se alcanzó a procesar o falló y quedan intentos). */
export async function liberar(procesoId: string, id: string, error: string | null, descontarIntento: boolean): Promise<void> {
  const ref = colaArchivos(procesoId).doc(id);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const a = snap.data() as ArchivoCola;
    tx.update(ref, {
      estado: "pendiente",
      disponibleDesde: 0,
      error,
      intentos: descontarIntento ? Math.max(0, a.intentos - 1) : a.intentos,
    });
  });
}

export { TERMINADO };
