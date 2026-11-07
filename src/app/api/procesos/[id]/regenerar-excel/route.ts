import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { regenerarExcel } from "@/lib/procesamiento/finalizar";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

/** Genera de nuevo el Excel de un lote terminado (para que incluya las correcciones hechas a mano). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/regenerar-excel">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  if (dueno.proceso.estado !== "terminado") return Response.json({ error: "El lote aún no termina" }, { status: 409 });
  return Response.json({ rutaExcel: await regenerarExcel(id) });
}
