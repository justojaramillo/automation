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
}

/** indices_numero/{numero} */
export interface IndiceNumero {
  hashArchivo: string;
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
}

/** procesos/{procesoId}/archivos/{id}: la cola de trabajo. */
export interface ArchivoCola {
  blobPathname: string;
  nombre: string;
  estado: EstadoArchivo;
  resultado: ResultadoArchivo | null;
  clienteNuevo: boolean;
  intentos: number;
  error: string | null;
  /** 0 = espera; ahora+5min = arrendado; MAX_SAFE_INTEGER = terminado. */
  disponibleDesde: number;
}

export const TERMINADO = Number.MAX_SAFE_INTEGER;
export const ARRENDAMIENTO_MS = 5 * 60 * 1000;
