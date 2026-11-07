// Crea la cola de trabajo a partir de las imágenes subidas a Blob y pasa el proceso a `ejecutando`.
// Idempotente: el ID de cada documento sale del nombre del blob; repetir la llamada no duplica.

import { listarImagenes } from "@/lib/blob";
import { firestore } from "@/lib/firebase/admin";
import type { ArchivoCola } from "@/lib/modelo/tipos";
import { colaArchivos } from "./cola";
import { refProceso } from "./proceso";

export async function iniciarProceso(procesoId: string, limite = Infinity): Promise<number> {
  const imagenes = (await listarImagenes(procesoId)).slice(0, limite);
  if (imagenes.length === 0) return 0;
  const escritor = firestore().bulkWriter(); // un lote de escritura admite 500 operaciones; BulkWriter las reparte
  const cola = colaArchivos(procesoId);
  for (const img of imagenes) {
    const nombre = img.pathname.split("/").pop()!;
    const archivo: ArchivoCola = {
      blobPathname: img.pathname, nombre: nombre.replace(/^\d{4}-/, ""), estado: "pendiente", resultado: null,
      clienteNuevo: false, intentos: 0, error: null, disponibleDesde: 0,
    };
    // create() falla si ya existe (repetir /iniciar): se ignora y la cola conserva su avance.
    escritor.create(cola.doc(nombre), archivo).catch(() => undefined);
  }
  await escritor.close();
  await refProceso(procesoId).update({ estado: "ejecutando", totalArchivos: imagenes.length });
  return imagenes.length;
}
