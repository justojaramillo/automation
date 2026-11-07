// Ruta de diagnóstico (Fase 1): comprueba que, ya desplegada, la función de Vercel contiene los
// datos de idioma de tesseract (outputFileTracingIncludes) y que `sharp` carga. Solo devuelve
// booleanos y nombres, ningún secreto. Desde la Fase A exige sesión.

import { access } from "node:fs/promises";
import path from "node:path";
import { connection, type NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";

const VARIABLES_REQUERIDAS = [
  "BLOB_READ_WRITE_TOKEN",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];

const DATOS_SPA = path.join(
  process.cwd(),
  "node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
);

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Con cacheComponents las rutas se prerenderizan en el build salvo que usen algo de la petición.
  // `connection()` obliga a ejecutarla en cada petición (si no, los valores quedarían del build).
  await connection();
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  let sharpCarga = false;
  try {
    const { default: sharp } = await import("sharp");
    sharpCarga = (await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer()).length > 0;
  } catch {
    sharpCarga = false;
  }
  return Response.json({
    ok: true,
    node: process.version,
    datosTesseractSpa: await existe(DATOS_SPA),
    sharp: sharpCarga,
    entorno: {
      vercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      // Solo nombres de variables que faltan o están vacías; jamás se devuelve un valor.
      variablesFaltantes: VARIABLES_REQUERIDAS.filter((nombre) => !process.env[nombre]),
    },
  });
}
