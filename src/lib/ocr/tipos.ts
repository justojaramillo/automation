import type { ItemFactura } from "@/lib/modelo/tipos";

/** Lo que el extractor logra leer del texto; `null` = no se encontró. */
export interface ParcialFactura {
  numero: string | null;
  /** Fecha de EMISIÓN normalizada a yyyy-mm-dd. */
  fecha: string | null;
  proveedor: string | null;
  /** NIT del proveedor sin puntos ni DV. */
  nitProveedor: string | null;
  dvProveedor: number | null;
  /** Documento del cliente sin puntos ni DV. */
  clienteDocumento: string | null;
  clienteDv: number | null;
  clienteNombre: string | null;
  items: ItemFactura[];
  subtotal: number | null;
  iva: number | null;
  /** `null` si no hay línea de impoconsumo con valor legible. */
  impoconsumo: number | null;
  /** El texto habla de impoconsumo/consumo (aunque no se haya podido leer el valor). */
  mencionaImpoconsumo: boolean;
  total: number | null;
}
