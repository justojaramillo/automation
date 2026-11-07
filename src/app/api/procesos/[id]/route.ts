import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

/** Estado del lote + sus métricas (UNA lectura). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  const p = dueno.proceso;
  // El avance sale de los contadores del propio documento (ya leído): 0 lecturas extra por sondeo.
  return Response.json({
    id, carpeta: p.carpeta, estado: p.estado, totalArchivos: p.totalArchivos,
    inicio: p.inicio.toMillis(), fin: p.fin?.toMillis() ?? null, tieneExcel: Boolean(p.rutaExcel), metricas: p.metricas ?? {},
  });
}
