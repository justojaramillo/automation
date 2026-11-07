import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { iniciarProceso } from "@/lib/procesamiento/iniciar";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 60;

/** Lista las imágenes subidas, crea la cola y pasa el proceso a `ejecutando`. Responde de inmediato. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/iniciar">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  if (dueno.proceso.estado === "terminado") return Response.json({ totalArchivos: dueno.proceso.totalArchivos });

  const cuerpo = (await request.json().catch(() => null)) as { limite?: unknown } | null;
  const limite = typeof cuerpo?.limite === "number" && cuerpo.limite > 0 ? Math.floor(cuerpo.limite) : Infinity;
  const total = await iniciarProceso(id, limite);
  if (total === 0) return Response.json({ error: "No hay imágenes subidas en este proceso" }, { status: 400 });
  return Response.json({ totalArchivos: total });
}
