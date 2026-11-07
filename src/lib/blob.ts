// Utilidades de Vercel Blob (store PRIVADO): rutas, listado y lectura en memoria.
// Las imágenes nunca pasan por nuestra API al subir (el navegador sube directo con un token);
// aquí solo se LEEN desde funciones del servidor.

import { get, list, put } from "@vercel/blob";
import { EXTENSIONES_IMAGEN, prefijoProceso } from "@/lib/rutas";

/** Imágenes subidas al proceso (excluye el Excel y cualquier otro archivo). Pagina con cursor. */
export async function listarImagenes(procesoId: string): Promise<{ pathname: string; size: number }[]> {
  const res: { pathname: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: prefijoProceso(procesoId), limit: 1000, cursor });
    for (const b of pagina.blobs) if (EXTENSIONES_IMAGEN.test(b.pathname)) res.push({ pathname: b.pathname, size: b.size });
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return res.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

/** Descarga un blob privado completo a memoria. */
export async function leerBlob(pathname: string): Promise<{ buffer: Buffer; contentType: string }> {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) throw new Error(`No se encontró el blob ${pathname}`);
  return { buffer: Buffer.from(await new Response(r.stream).arrayBuffer()), contentType: r.blob.contentType };
}

/** Sube un archivo generado por el servidor (el Excel). */
export async function subirBlob(pathname: string, cuerpo: Buffer, contentType: string): Promise<string> {
  const r = await put(pathname, cuerpo, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  return r.pathname;
}
