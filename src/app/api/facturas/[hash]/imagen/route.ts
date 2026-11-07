import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

/** Imagen original de una factura, servida desde el Blob privado (solo a su dueño). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/facturas/[hash]/imagen">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { hash } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return Response.json({ error: "Identificador no válido" }, { status: 400 });
  const snap = await firestore().collection(COLECCIONES.facturas).doc(hash).get();
  if (!snap.exists || (snap.data() as Factura).uid !== usuario.uid) return Response.json({ error: "No encontrada" }, { status: 404 });
  const blob = await get((snap.data() as Factura).blobPathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return Response.json({ error: "Imagen no encontrada" }, { status: 404 });
  return new Response(blob.stream, { headers: { "content-type": blob.blob.contentType, "cache-control": "private, max-age=3600" } });
}
