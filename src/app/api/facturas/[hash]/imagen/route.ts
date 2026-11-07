import { get } from "@vercel/blob";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

const ROTACIONES = new Set([90, 180, 270]);

/**
 * Imagen original de una factura, servida desde el Blob privado (solo a su dueño).
 * `?rotar=90|180|270` la gira en el servidor: una factura fotografiada de lado no se puede leer a simple vista y
 * la revisión manual debe poder enderezarla. El original en Blob no se toca.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/facturas/[hash]/imagen">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { hash } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return Response.json({ error: "Identificador no válido" }, { status: 400 });
  const snap = await firestore().collection(COLECCIONES.facturas).doc(hash).get();
  if (!snap.exists || (snap.data() as Factura).uid !== usuario.uid) return Response.json({ error: "No encontrada" }, { status: 404 });
  const blob = await get((snap.data() as Factura).blobPathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return Response.json({ error: "Imagen no encontrada" }, { status: 404 });
  const rotar = Number(request.nextUrl.searchParams.get("rotar") ?? 0);
  if (rotar !== 0 && !ROTACIONES.has(rotar)) return Response.json({ error: "rotar debe ser 0, 90, 180 o 270" }, { status: 400 });
  if (rotar !== 0) {
    const girada = await sharp(Buffer.from(await new Response(blob.stream).arrayBuffer())).rotate(rotar, { background: "#ffffff" }).toBuffer();
    return new Response(new Uint8Array(girada), { headers: { "content-type": blob.blob.contentType, "cache-control": "private, max-age=3600" } });
  }
  return new Response(blob.stream, { headers: { "content-type": blob.blob.contentType, "cache-control": "private, max-age=3600" } });
}
