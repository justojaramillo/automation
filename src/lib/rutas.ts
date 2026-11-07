// Funciones PURAS de rutas de Blob: se usan en el servidor y en el navegador (sin importar el SDK).

export const prefijoProceso = (procesoId: string): string => `procesos/${procesoId}/`;

export const EXTENSIONES_IMAGEN = /\.(png|jpe?g)$/i;

/** Nombre seguro y único dentro del proceso: `0007-factura_0007.png`. */
export function pathnameDeSubida(procesoId: string, indice: number, nombreOriginal: string): string {
  const limpio = nombreOriginal
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-80);
  return `${prefijoProceso(procesoId)}${String(indice).padStart(4, "0")}-${limpio}`;
}
