// Subida de UNA imagen por petición, a través de nuestra API (las imágenes NO van directo del navegador a
// Blob). El servidor es quien valida y quien escribe en el almacén:
//   sesión → lote propio en «subiendo» → tamaño → tipo REAL por los bytes → imagen decodificable → Blob.
// Cada factura pesa unos 100 KB; el máximo de 4 MB deja margen bajo el límite de 4,5 MB por petición de Vercel.

import sharp from "sharp";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { subirBlob } from "@/lib/blob";
import { detectarTipoImagen, MAX_BYTES_IMAGEN, MAX_PIXELES, nombreConExtension } from "@/lib/imagen";
import { loteAdmiteSubidas } from "@/lib/procesamiento/subidas";
import { pathnameDeSubida } from "@/lib/rutas";

export const maxDuration = 60;

const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/imagenes">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id) || !(await loteAdmiteSubidas(id, usuario.uid))) {
    return error("El lote no existe o ya no admite imágenes", 404);
  }

  const indice = Number(request.nextUrl.searchParams.get("indice"));
  const nombre = (request.nextUrl.searchParams.get("nombre") ?? "").slice(0, 200);
  if (!Number.isInteger(indice) || indice < 1 || indice > 9999) return error("Falta un índice válido", 400);

  // Tamaño: se mira la cabecera antes de leer el cuerpo y se comprueba otra vez con los bytes reales.
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_IMAGEN) return error("La imagen pesa más de 4 MB", 413);
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAX_BYTES_IMAGEN) return error("La imagen pesa más de 4 MB", 413);

  // Tipo REAL por los primeros bytes (no por el nombre ni por el content-type que declara el navegador).
  const tipo = detectarTipoImagen(buffer);
  if (!tipo) return error("El archivo no es una imagen PNG o JPG válida", 415);
  try {
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) throw new Error("sin dimensiones");
    if (width * height > MAX_PIXELES) return error("La imagen tiene demasiados píxeles", 413);
  } catch {
    return error("La imagen está dañada y no se puede leer", 415);
  }

  const pathname = await subirBlob(pathnameDeSubida(id, indice, nombreConExtension(nombre, tipo)), buffer, tipo);
  return Response.json({ pathname });
}
