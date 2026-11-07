// Modelo de datos (Fase 2). Firestore es de documentos: la unicidad se logra usando el valor
// único como ID del documento y creándolo dentro de una transacción.
// Importes COP: enteros. Fechas: texto "yyyy-mm-dd". Marcas de tiempo: Timestamp de Firestore.

import type { Timestamp } from "firebase-admin/firestore";

export const COLECCIONES = {
  clientes: "clientes",
  facturas: "facturas",
  indicesNumero: "indices_numero",
  procesos: "procesos",
  archivos: "archivos", // subcolección de procesos/{id}
} as const;

export type EstadoFactura = "aceptada" | "revision";
export type EstadoProceso = "en_cola" | "subiendo" | "ejecutando" | "terminado" | "error";
export type EstadoArchivo = "pendiente" | "procesando" | "ok" | "error";
export type ResultadoArchivo = "aceptada" | "revision" | "duplicada" | "error";

export interface ItemFactura {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** clientes/{documento} */
export interface Cliente {
  documento: string;
  dv: number;
  nombre: string;
  creadoEn: Timestamp;
  primerProcesoId: string;
}

/** facturas/{hashArchivo} (SHA-256 de la imagen) */
export interface Factura {
  numero: string | null;
  fecha: string | null;
  proveedor: string | null;
  nitProveedor: string | null;
  /** `null` si no pasó el dígito de verificación: queda en revisión y no se crea cliente. */
  clienteDocumento: string | null;
  clienteNombre: string | null;
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number;
  total: number | null;
  estado: EstadoFactura;
  motivos: string[];
  archivo: string;
  blobPathname: string;
  confianzaOcr: number;
  procesoId: string;
  uid: string;
  creadoEn: Timestamp;
  items: ItemFactura[];
  /** Dígitos de verificación y documento tal como los leyó el OCR (para precargar el formulario de revisión). */
  dvProveedor?: number | null;
  clienteDv?: number | null;
  clienteDocumentoLeido?: string | null;
  /** Revisión humana: quién la corrigió, cuándo, qué decía la máquina y qué validaciones se ignoraron. */
  corregidaManualmente?: boolean;
  corregidaPor?: string;
  corregidaEn?: Timestamp;
  motivosOriginales?: string[];
  validacionesIgnoradas?: string[];
}

/** indices_numero/{numero} */
export interface IndiceNumero {
  hashArchivo: string;
}

/** Importes acumulados (COP, enteros) de un grupo de facturas. */
export interface Importes {
  n: number;
  subtotal: number;
  iva: number;
  impoconsumo: number;
  total: number;
}

export interface MetricasProveedor extends Importes {
  nombre: string;
}

/**
 * Métricas de un LOTE (un proceso). Se actualizan con FieldValue.increment DENTRO de la misma
 * transacción que guarda cada factura: son consistentes con los datos y el panel cuesta 1 lectura
 * por lote (no una por factura).
 */
export interface Metricas {
  /** Pasaron todas las validaciones. */
  aceptadas: Importes;
  /** Falló alguna validación (o no se pudo leer algún campo). */
  revision: Importes;
  /**
   * Facturas que una persona ingresó o corrigió a mano (antes estaban en revisión o con error).
   * NO entran en «leídas correctamente», que mide a la máquina; sus importes sí suman a lo procesado.
   */
  manuales: Importes;
  /** Archivos que no se pudieron procesar tras agotar los intentos. */
  errores: number;
  /** Imágenes que ya estaban en la base (mismo SHA-256): no se cuentan dos veces. */
  duplicadas: number;
  clientesNuevos: number;
  /** Solo facturas aceptadas, por NIT del proveedor (sin DV). */
  proveedores: Record<string, MetricasProveedor>;
}

/** procesos/{procesoId} */
export interface Proceso {
  uid: string;
  carpeta: string;
  estado: EstadoProceso;
  totalArchivos: number;
  inicio: Timestamp;
  fin: Timestamp | null;
  rutaExcel: string | null;
  /** Marca (ms) de quien está generando el Excel: evita que dos clientes lo hagan a la vez. */
  finalizandoDesde?: number;
  metricas?: Partial<Metricas>;
}

/** procesos/{procesoId}/archivos/{id}: la cola de trabajo. */
export interface ArchivoCola {
  blobPathname: string;
  nombre: string;
  estado: EstadoArchivo;
  resultado: ResultadoArchivo | null;
  clienteNuevo: boolean;
  /** El cliente ya existía (ya estaba en `clientes`). */
  clienteExistente?: boolean;
  /** SHA-256 de la imagen (ID de la factura); se conoce una vez descargada. */
  hashArchivo?: string;
  intentos: number;
  error: string | null;
  /** 0 = espera; ahora+5min = arrendado; MAX_SAFE_INTEGER = terminado. */
  disponibleDesde: number;
}

export const TERMINADO = Number.MAX_SAFE_INTEGER;
export const ARRENDAMIENTO_MS = 5 * 60 * 1000;
