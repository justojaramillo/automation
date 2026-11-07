// Validación PURA de imágenes subidas (sirve en servidor y en pruebas). No se confía en el nombre ni en el
// `content-type` que declara el navegador: el tipo real se deduce de los primeros bytes del archivo.

/** Por debajo del límite de 4,5 MB de cuerpo de petición de una función de Vercel (con margen). */
export const MAX_BYTES_IMAGEN = 4_000_000;
/** Una imagen no puede tener más de este número de píxeles (protege la memoria al decodificarla). */
export const MAX_PIXELES = 40_000_000;

export type TipoImagen = "image/png" | "image/jpeg";

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff];

const empieza = (bytes: Uint8Array, firma: number[]): boolean => bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);

export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (empieza(bytes, FIRMA_PNG)) return "image/png";
  if (empieza(bytes, FIRMA_JPEG)) return "image/jpeg";
  return null;
}

/** Nombre sin la extensión original, con la extensión que corresponde al tipo REAL del archivo. */
export function nombreConExtension(nombre: string, tipo: TipoImagen): string {
  const base = nombre.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "imagen";
  return `${base}.${tipo === "image/png" ? "png" : "jpg"}`;
}
