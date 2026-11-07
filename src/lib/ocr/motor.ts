// Motor de OCR: UN worker de tesseract.js (idioma español, datos locales, sin descargas de red)
// reutilizado entre invocaciones de la misma instancia caliente (se guarda en globalThis).
// La imagen llega como Buffer (descargada de Blob), nunca del disco.

import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

export type ModoOcr = "original" | "preprocesado" | "encabezado";

export interface LecturaOcr {
  texto: string;
  /** Confianza media de tesseract, 0–100. */
  confianza: number;
}

const DIR_DATOS = path.join(process.cwd(), "node_modules/@tesseract.js-data/spa/4.0.0_best_int");

const global = globalThis as unknown as { __ocrWorker?: Promise<Worker> };

const TOPE_ARRANQUE_MS = 60_000;
const TOPE_LECTURA_MS = 60_000;

/**
 * El worker de tesseract corre en un hilo aparte: si no puede cargar un archivo (por ejemplo, el núcleo
 * WASM no quedó en el paquete de la función), el hilo muere en silencio y la promesa nunca se resuelve.
 * Sin tope, la función se cuelga hasta el 504. Con tope, falla con un mensaje claro y el lote lo reintenta.
 */
function conTope<T>(promesa: Promise<T>, ms: number, que: string): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(`${que} excedió ${ms / 1000} s (¿faltan archivos de tesseract en el paquete?)`)), ms);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

/** Descarta el worker (si se colgó, el siguiente intento arranca uno nuevo). */
function descartarWorker(): void {
  const viejo = global.__ocrWorker;
  global.__ocrWorker = undefined;
  viejo?.then((w) => w.terminate()).catch(() => undefined);
}

function worker(): Promise<Worker> {
  global.__ocrWorker ??= conTope(
    createWorker("spa", 1, {
      langPath: DIR_DATOS, // los datos vienen empaquetados: no se descarga nada
      gzip: true, // los archivos son .traineddata.gz
      cachePath: os.tmpdir(), // el sistema de archivos de Vercel es de solo lectura salvo /tmp
      cacheMethod: "none",
    }),
    TOPE_ARRANQUE_MS,
    "El arranque de tesseract",
  ).catch((error: unknown) => {
    global.__ocrWorker = undefined; // permite reintentar si falló el arranque
    throw error;
  });
  return global.__ocrWorker;
}

/** Prepara la imagen según el modo (el original se lee tal cual). */
async function preparar(buffer: Buffer, modo: ModoOcr): Promise<Buffer> {
  if (modo === "original") return buffer;
  const base = sharp(buffer).rotate(); // respeta la orientación EXIF
  if (modo === "preprocesado") {
    const meta = await base.metadata();
    return base
      .grayscale()
      .normalize()
      .resize({ width: Math.round((meta.width ?? 1000) * 1.5) })
      .sharpen()
      .toBuffer();
  }
  // "encabezado": franja superior (30 %) invertida. Recupera texto blanco sobre fondo de color
  // (razón social y NIT del proveedor en el diseño de encabezado de color).
  const { data, info } = await base.toBuffer({ resolveWithObject: true });
  return sharp(data)
    .extract({ left: 0, top: 0, width: info.width, height: Math.round(info.height * 0.3) })
    .grayscale()
    .negate()
    .normalize()
    .resize({ width: Math.round(info.width * 1.5) })
    .toBuffer();
}

export async function leerImagen(buffer: Buffer, modo: ModoOcr = "original"): Promise<LecturaOcr> {
  const w = await worker();
  const imagen = await preparar(buffer, modo);
  try {
    const { data } = await conTope(w.recognize(imagen), TOPE_LECTURA_MS, "La lectura OCR");
    return { texto: data.text, confianza: data.confidence };
  } catch (error) {
    descartarWorker();
    throw error;
  }
}
