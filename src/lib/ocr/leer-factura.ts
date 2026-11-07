// Estrategia de lectura de UNA factura (Fase 5): OCR del original → si hay motivos, reintento
// preprocesado → si sigue habiendo, se agrega la franja superior invertida (texto blanco sobre
// color). Se queda con el resultado que tenga MENOS motivos. Lo que siga fallando queda en revisión.

import { extraer } from "./extractor";
import { leerImagen, type ModoOcr } from "./motor";
import type { ParcialFactura } from "./tipos";
import { validar } from "./validador";

export interface FacturaLeida {
  parcial: ParcialFactura;
  motivos: string[];
  /** Confianza media de tesseract (0–100) del texto elegido. */
  confianza: number;
  /** Modos probados, en orden (para diagnóstico y métricas). */
  modos: ModoOcr[];
}

export async function leerFactura(imagen: Buffer): Promise<FacturaLeida> {
  const modos: ModoOcr[] = ["original"];
  const original = await leerImagen(imagen, "original");
  let texto = original.texto;
  let confianza = original.confianza;
  let parcial = extraer(texto);
  let motivos = validar(parcial);

  if (motivos.length > 0) {
    modos.push("preprocesado");
    const pre = await leerImagen(imagen, "preprocesado");
    const parcialPre = extraer(pre.texto);
    const motivosPre = validar(parcialPre);
    if (motivosPre.length < motivos.length) {
      ({ texto, confianza, parcial, motivos } = { texto: pre.texto, confianza: pre.confianza, parcial: parcialPre, motivos: motivosPre });
    }
  }

  if (motivos.length > 0) {
    modos.push("encabezado");
    const enc = await leerImagen(imagen, "encabezado");
    const combinado = `${enc.texto}\n${texto}`; // el encabezado recuperado va primero
    const parcialEnc = extraer(combinado);
    const motivosEnc = validar(parcialEnc);
    if (motivosEnc.length < motivos.length) {
      ({ parcial, motivos } = { parcial: parcialEnc, motivos: motivosEnc });
    }
  }
  return { parcial, motivos, confianza, modos };
}
