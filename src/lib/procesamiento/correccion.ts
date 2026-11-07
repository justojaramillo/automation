// Revisión manual (PURA: la usan el navegador y el servidor, así la validación en vivo del formulario es
// exactamente la misma que se aplica al guardar). Una factura que la máquina no pudo aceptar la completa o
// corrige una persona viendo la imagen; sus datos se validan con las mismas reglas que las del OCR.

import type { ItemFactura } from "@/lib/modelo/tipos";
import { INC_TARIFA, IVA_TARIFA } from "@/lib/ocr/constantes";
import type { ParcialFactura } from "@/lib/ocr/tipos";

export interface DatosManuales {
  numero: string;
  /** Fecha de emisión, yyyy-mm-dd. */
  fecha: string;
  proveedor: string;
  nitProveedor: string;
  dvProveedor: number;
  clienteDocumento: string;
  clienteDv: number;
  clienteNombre: string;
  items: ItemFactura[];
  subtotal: number;
  iva: number;
  impoconsumo: number;
  total: number;
}

/** Solo los dígitos de un texto ("900.123.456" → "900123456"). */
export const soloDigitos = (texto: string): string => texto.replace(/\D/g, "");

/** Importe entero en pesos a partir de lo que escribe la persona ("1.234.567" o "$ 1234567" → 1234567). */
export const aEntero = (texto: string): number => {
  const d = soloDigitos(texto);
  return d === "" ? 0 : Number(d);
};

/**
 * Totales que se proponen a partir de los ítems (la persona puede corregirlos): el IVA es el 19 % del valor
 * antes de IVA, el impoconsumo el 4 % solo si aplica (telefonía móvil y datos), y total = suma de los tres.
 */
export function totalesSugeridos(items: readonly ItemFactura[], aplicaImpoconsumo: boolean): { subtotal: number; iva: number; impoconsumo: number; total: number } {
  const subtotal = items.reduce((a, it) => a + it.subtotal, 0);
  const iva = Math.round(subtotal * IVA_TARIFA);
  const impoconsumo = aplicaImpoconsumo ? Math.round(subtotal * INC_TARIFA) : 0;
  return { subtotal, iva, impoconsumo, total: subtotal + iva + impoconsumo };
}

/** Lo que ve `validar()`: los mismos campos que extrae el OCR. */
export function aParcial(d: DatosManuales): ParcialFactura {
  return {
    numero: d.numero.trim() || null,
    fecha: d.fecha.trim() || null,
    proveedor: d.proveedor.trim() || null,
    nitProveedor: d.nitProveedor.trim() || null,
    dvProveedor: d.nitProveedor.trim() ? d.dvProveedor : null,
    clienteDocumento: d.clienteDocumento.trim() || null,
    clienteDv: d.clienteDocumento.trim() ? d.clienteDv : null,
    clienteNombre: d.clienteNombre.trim() || null,
    items: d.items,
    subtotal: d.subtotal,
    iva: d.iva,
    impoconsumo: d.impoconsumo > 0 ? d.impoconsumo : null,
    mencionaImpoconsumo: d.impoconsumo > 0,
    total: d.total,
  };
}
