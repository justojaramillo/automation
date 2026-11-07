import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { finalizarProceso } from "@/lib/procesamiento/finalizar";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

/** Idempotente: si quedan archivos sin terminar responde `listo: false`; si no, genera el Excel una sola vez. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/finalizar">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  if (dueno.proceso.estado !== "ejecutando" && dueno.proceso.estado !== "terminado") {
    return Response.json({ error: "El proceso no está en ejecución" }, { status: 409 });
  }
  return Response.json(await finalizarProceso(id));
}
