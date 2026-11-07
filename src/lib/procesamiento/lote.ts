// Un LOTE: reclama pocos archivos, los procesa en serie (OCR → extraer → validar → guardar) y responde.
// Idempotente: si la función se corta, los arrendamientos caducan y otro lote retoma lo pendiente.

import { createHash } from "node:crypto";
import { leerBlob } from "@/lib/blob";
import { leerFactura } from "@/lib/ocr/leer-factura";
import { liberar, reclamar } from "./cola";
import { guardarFactura, guardarFallo, marcarDuplicadaSiExiste } from "./guardar";

export const MAX_INTENTOS = 3;

export interface ResumenLote {
  reclamados: number;
  aceptadas: number;
  revision: number;
  duplicadas: number;
  errores: number;
  devueltos: number;
  msTotal: number;
  /** Tiempo por archivo, para medir (Fase 5). */
  detalle: { id: string; ms: number; modos: string; resultado: string }[];
}

const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

export async function procesarLote(opts: {
  procesoId: string;
  uid: string;
  tamano: number;
  /** Cuando el tiempo transcurrido pasa de aquí, se devuelven los archivos que faltan. */
  presupuestoMs: number;
}): Promise<ResumenLote> {
  const t0 = Date.now();
  const resumen: ResumenLote = { reclamados: 0, aceptadas: 0, revision: 0, duplicadas: 0, errores: 0, devueltos: 0, msTotal: 0, detalle: [] };
  const archivos = await reclamar(opts.procesoId, opts.tamano);
  resumen.reclamados = archivos.length;

  for (const a of archivos) {
    if (Date.now() - t0 > opts.presupuestoMs) {
      await liberar(opts.procesoId, a.id, null, true); // no se alcanzó: no cuenta como intento
      resumen.devueltos++;
      continue;
    }
    const t1 = Date.now();
    let hash = sha256(a.blobPathname); // si la descarga falla, aún hay un ID estable para el fallo
    try {
      const { buffer } = await leerBlob(a.blobPathname);
      hash = sha256(buffer);
      if (await marcarDuplicadaSiExiste(opts.procesoId, a.id, hash)) {
        resumen.duplicadas++;
        resumen.detalle.push({ id: a.id, ms: Date.now() - t1, modos: "-", resultado: "duplicada" });
        continue;
      }
      const lectura = await leerFactura(buffer);
      const resultado = await guardarFactura({
        procesoId: opts.procesoId, uid: opts.uid, archivoId: a.id, nombre: a.nombre, blobPathname: a.blobPathname,
        hash, parcial: lectura.parcial, motivos: lectura.motivos, confianza: lectura.confianza,
      });
      if (resultado === "aceptada") resumen.aceptadas++;
      else if (resultado === "revision") resumen.revision++;
      else resumen.duplicadas++;
      resumen.detalle.push({ id: a.id, ms: Date.now() - t1, modos: lectura.modos.join(">"), resultado });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      if (a.intentos >= MAX_INTENTOS) {
        await guardarFallo({ procesoId: opts.procesoId, uid: opts.uid, archivoId: a.id, nombre: a.nombre, blobPathname: a.blobPathname, hash, error: mensaje });
        resumen.errores++;
      } else {
        await liberar(opts.procesoId, a.id, mensaje, false);
        resumen.devueltos++;
      }
      resumen.detalle.push({ id: a.id, ms: Date.now() - t1, modos: "-", resultado: `error: ${mensaje}` });
    }
  }
  resumen.msTotal = Date.now() - t0;
  return resumen;
}
