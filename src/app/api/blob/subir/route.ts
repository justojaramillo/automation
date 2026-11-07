// Emite tokens de subida directa a Blob (client upload). Las imágenes NO pasan por esta función
// (el límite de cuerpo en Vercel es 4,5 MB). Valida: sesión, proceso propio en estado `subiendo`,
// ruta bajo procesos/<id>/, tipo PNG/JPG y tamaño máximo.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { EXTENSIONES_IMAGEN } from "@/lib/rutas";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  // Solo se atiende la petición de token. El aviso `upload-completed` no se usa (no llega en local sin túnel).
  if (!body || body.type !== "blob.generate-client-token") {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  try {
    const respuesta = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const m = pathname.match(/^procesos\/([A-Za-z0-9]+)\/[^/]+$/);
        if (!m || !EXTENSIONES_IMAGEN.test(pathname)) throw new Error("Ruta no permitida");
        const dueno = await procesoDelUsuario(m[1], usuario.uid);
        if (dueno instanceof Response) throw new Error("Proceso no encontrado");
        if (dueno.proceso.estado !== "subiendo") throw new Error("El proceso ya no admite subidas");
        return {
          allowedContentTypes: ["image/png", "image/jpeg"],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true, // permite reintentar la subida de un archivo
        };
      },
    });
    return Response.json(respuesta);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error" }, { status: 400 });
  }
}
