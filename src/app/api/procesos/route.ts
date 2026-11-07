import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";

/** Procesos del usuario (solo los suyos). */
export async function GET(request: NextRequest) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  // Un solo campo en el filtro: no hace falta índice compuesto; se ordena en memoria.
  const consulta = await firestore()
    .collection(COLECCIONES.procesos)
    .where("uid", "==", usuario.uid)
    .limit(50)
    .get();
  const procesos = consulta.docs
    .map((d) => {
      const p = d.data() as Proceso;
      return { id: d.id, carpeta: p.carpeta, estado: p.estado, totalArchivos: p.totalArchivos, inicio: p.inicio.toMillis() };
    })
    .sort((a, b) => b.inicio - a.inicio);
  return Response.json({ procesos });
}
