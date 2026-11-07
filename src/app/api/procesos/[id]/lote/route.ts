import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { procesarLote } from "@/lib/procesamiento/lote";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

// Plan Hobby: máx. 300 s por invocación. El lote deja de procesar bastante antes (margen seguro).
export const maxDuration = 300;
const PRESUPUESTO_MS = 200_000;
const TAMANO_LOTE = 4;

/** Reclama y procesa un lote pequeño. El navegador lanza varias llamadas concurrentes hasta que `reclamados` sea 0. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/lote">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;
  if (dueno.proceso.estado !== "ejecutando") {
    return Response.json({ reclamados: 0, estado: dueno.proceso.estado });
  }
  const resumen = await procesarLote({ procesoId: id, uid: usuario.uid, tamano: TAMANO_LOTE, presupuestoMs: PRESUPUESTO_MS });
  return Response.json(resumen);
}
