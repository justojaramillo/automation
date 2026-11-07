import type { DocumentReference } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";

export const refProceso = (id: string): DocumentReference => firestore().collection(COLECCIONES.procesos).doc(id);

/** Carga un proceso comprobando que es del usuario. Devuelve una Response de error si no. */
export async function procesoDelUsuario(
  id: string,
  uid: string,
): Promise<{ ref: DocumentReference; proceso: Proceso } | Response> {
  const snap = await refProceso(id).get();
  // 404 tanto si no existe como si es de otro usuario: no se revela la existencia.
  if (!snap.exists || (snap.data() as Proceso).uid !== uid) {
    return Response.json({ error: "Proceso no encontrado" }, { status: 404 });
  }
  return { ref: snap.ref, proceso: snap.data() as Proceso };
}
