// Funciones PURAS de métricas (sin Firestore): describir los cambios, sumar lotes y calcular tasas.

import type { Importes, Metricas, MetricasProveedor } from "@/lib/modelo/tipos";

export const importesVacios = (): Importes => ({ n: 0, subtotal: 0, iva: 0, impoconsumo: 0, total: 0 });

export const metricasVacias = (): Metricas => ({
  aceptadas: importesVacios(),
  revision: importesVacios(),
  errores: 0,
  duplicadas: 0,
  clientesNuevos: 0,
  proveedores: {},
});

// ───────────────────────── Cambios (lo que se incrementa al guardar) ─────────────────────────

export type EventoMetrica =
  | { tipo: "duplicada" }
  | { tipo: "error" }
  | {
      tipo: "factura";
      estado: "aceptada" | "revision";
      subtotal: number | null;
      iva: number | null;
      impoconsumo: number | null;
      total: number | null;
      clienteNuevo: boolean;
      /** NIT sin DV y razón social (solo se usan si la factura fue aceptada). */
      nitProveedor: string | null;
      proveedor: string | null;
    };

/** Un cambio: sumar `incremento` a la ruta, o fijar `texto` (nombre del proveedor). */
export type Cambio = { ruta: string[]; incremento: number } | { ruta: string[]; texto: string };

export function cambiosDe(e: EventoMetrica): Cambio[] {
  if (e.tipo === "duplicada") return [{ ruta: ["metricas", "duplicadas"], incremento: 1 }];
  if (e.tipo === "error") return [{ ruta: ["metricas", "errores"], incremento: 1 }];
  const grupo = e.estado === "aceptada" ? "aceptadas" : "revision";
  const cambios: Cambio[] = [
    { ruta: ["metricas", grupo, "n"], incremento: 1 },
    { ruta: ["metricas", grupo, "subtotal"], incremento: e.subtotal ?? 0 },
    { ruta: ["metricas", grupo, "iva"], incremento: e.iva ?? 0 },
    { ruta: ["metricas", grupo, "impoconsumo"], incremento: e.impoconsumo ?? 0 },
    { ruta: ["metricas", grupo, "total"], incremento: e.total ?? 0 },
  ];
  if (e.clienteNuevo) cambios.push({ ruta: ["metricas", "clientesNuevos"], incremento: 1 });
  if (e.estado === "aceptada" && e.nitProveedor) {
    const base = ["metricas", "proveedores", e.nitProveedor];
    cambios.push(
      { ruta: [...base, "n"], incremento: 1 },
      { ruta: [...base, "subtotal"], incremento: e.subtotal ?? 0 },
      { ruta: [...base, "iva"], incremento: e.iva ?? 0 },
      { ruta: [...base, "impoconsumo"], incremento: e.impoconsumo ?? 0 },
      { ruta: [...base, "total"], incremento: e.total ?? 0 },
      { ruta: [...base, "nombre"], texto: e.proveedor ?? e.nitProveedor },
    );
  }
  return cambios;
}

// ───────────────────────── Lectura y suma ─────────────────────────

const sumaImportes = (a: Importes, b?: Partial<Importes>): Importes => ({
  n: a.n + (b?.n ?? 0),
  subtotal: a.subtotal + (b?.subtotal ?? 0),
  iva: a.iva + (b?.iva ?? 0),
  impoconsumo: a.impoconsumo + (b?.impoconsumo ?? 0),
  total: a.total + (b?.total ?? 0),
});

/** Suma las métricas de varios lotes (los campos ausentes cuentan como 0). */
export function sumarMetricas(lotes: (Partial<Metricas> | undefined)[]): Metricas {
  const r = metricasVacias();
  for (const m of lotes) {
    if (!m) continue;
    r.aceptadas = sumaImportes(r.aceptadas, m.aceptadas);
    r.revision = sumaImportes(r.revision, m.revision);
    r.errores += m.errores ?? 0;
    r.duplicadas += m.duplicadas ?? 0;
    r.clientesNuevos += m.clientesNuevos ?? 0;
    for (const [nit, p] of Object.entries(m.proveedores ?? {})) {
      const previo: MetricasProveedor = r.proveedores[nit] ?? { ...importesVacios(), nombre: p.nombre };
      r.proveedores[nit] = { ...sumaImportes(previo, p), nombre: p.nombre || previo.nombre };
    }
  }
  return r;
}

export interface Tasas {
  /** Facturas distintas procesadas (aceptadas + revisión + errores). Las duplicadas NO cuentan: ya estaban. */
  total: number;
  correctas: number;
  malLeidas: number;
  /** Porcentajes 0–100 con un decimal; `null` si aún no hay facturas. */
  pctCorrectas: number | null;
  pctMalLeidas: number | null;
}

const pct = (parte: number, todo: number): number | null => (todo === 0 ? null : Math.round((parte / todo) * 1000) / 10);

/**
 * "Leída correctamente" = pasó TODAS las validaciones (impuestos, sumas, dígito de verificación…).
 * No se compara contra una respuesta conocida: es la medida que tiene la app en producción.
 * "Mal leída" = quedó en revisión o dio error.
 */
export function calcularTasas(m: Metricas): Tasas {
  const correctas = m.aceptadas.n;
  const malLeidas = m.revision.n + m.errores;
  const total = correctas + malLeidas;
  return { total, correctas, malLeidas, pctCorrectas: pct(correctas, total), pctMalLeidas: pct(malLeidas, total) };
}

export interface FilaProveedor extends MetricasProveedor {
  nit: string;
}

/** Proveedores ordenados por total, de mayor a menor. */
export function proveedoresOrdenados(m: Metricas): FilaProveedor[] {
  return Object.entries(m.proveedores)
    .map(([nit, p]) => ({ nit, ...p }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** Aplica eventos a unas métricas vacías (los mismos cambios que se hacen con increment al guardar). Sirve para recalcular un lote. */
export function metricasDesdeEventos(eventos: EventoMetrica[]): Metricas {
  const raiz: Record<string, unknown> = { metricas: metricasVacias() };
  for (const e of eventos) {
    for (const c of cambiosDe(e)) {
      let nodo = raiz;
      for (const clave of c.ruta.slice(0, -1)) {
        nodo[clave] ??= {};
        nodo = nodo[clave] as Record<string, unknown>;
      }
      const hoja = c.ruta[c.ruta.length - 1];
      nodo[hoja] = "incremento" in c ? ((nodo[hoja] as number | undefined) ?? 0) + c.incremento : c.texto;
    }
  }
  return raiz.metricas as Metricas;
}
