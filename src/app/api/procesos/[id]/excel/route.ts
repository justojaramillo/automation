import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

/** El store es privado: el Excel se lee con el SDK y se devuelve como descarga. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/excel">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  const ruta = dueno.proceso.rutaExcel;
  if (!ruta) return Response.json({ error: "El Excel aún no está disponible" }, { status: 404 });
  const blob = await get(ruta, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) return Response.json({ error: "No se encontró el Excel" }, { status: 404 });
  return new Response(blob.stream, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${ruta.split("/").pop()}"`,
      "cache-control": "private, no-store",
    },
  });
}
