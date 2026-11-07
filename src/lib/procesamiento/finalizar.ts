// Cierre idempotente del proceso: cuando no queda nada pendiente, genera el Excel y lo sube a Blob.

import { Timestamp } from "firebase-admin/firestore";
import { subirBlob } from "@/lib/blob";
import { firestore } from "@/lib/firebase/admin";
import { generarExcel, nombreExcel } from "@/lib/excel/generar";
import type { Proceso } from "@/lib/modelo/tipos";
import { contarSinTerminar } from "./avance";
import { refProceso } from "./proceso";

export type ResultadoFinalizar =
  | { listo: true; rutaExcel: string | null }
  | { listo: false; pendientes: number }
  | { listo: false; enCurso: true };

const BLOQUEO_MS = 2 * 60 * 1000;

export async function finalizarProceso(procesoId: string): Promise<ResultadoFinalizar> {
  const ref = refProceso(procesoId);
  const previo = (await ref.get()).data() as Proceso;
  if (previo.estado === "terminado") return { listo: true, rutaExcel: previo.rutaExcel };

  const pendientes = await contarSinTerminar(procesoId);
  if (pendientes > 0) return { listo: false, pendientes };

  // Un solo cliente genera el Excel: se "toma" el cierre dentro de una transacción.
  const tomado = await firestore().runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data() as Proceso;
    if (p.estado === "terminado") return false;
    if (p.finalizandoDesde && Date.now() - p.finalizandoDesde < BLOQUEO_MS) return false;
    tx.update(ref, { finalizandoDesde: Date.now() });
    return true;
  });
  if (!tomado) {
    const actual = (await ref.get()).data() as Proceso;
    return actual.estado === "terminado" ? { listo: true, rutaExcel: actual.rutaExcel } : { listo: false, enCurso: true };
  }

  const fin = new Date();
  const buffer = await generarExcel(procesoId, previo, fin);
  const ruta = await subirBlob(
    `procesos/${procesoId}/${nombreExcel(fin)}`,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  await ref.update({ estado: "terminado", fin: Timestamp.fromDate(fin), rutaExcel: ruta });
  return { listo: true, rutaExcel: ruta };
}
