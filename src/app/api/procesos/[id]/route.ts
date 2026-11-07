import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { calcularAvance } from "@/lib/procesamiento/avance";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

/** Estado del proceso + avance (UNA respuesta con todos los conteos). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  const p = dueno.proceso;
  // Antes de ejecutar (o ya terminado) no hay nada que contar: se ahorran lecturas.
  const avance = p.estado === "ejecutando" || p.estado === "terminado" ? await calcularAvance(id) : null;
  return Response.json({
    id, carpeta: p.carpeta, estado: p.estado, totalArchivos: p.totalArchivos,
    inicio: p.inicio.toMillis(), fin: p.fin?.toMillis() ?? null, tieneExcel: Boolean(p.rutaExcel), avance,
  });
}
