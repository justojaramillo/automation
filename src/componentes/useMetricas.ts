"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Metricas } from "@/lib/modelo/tipos";

export interface LoteMetricas {
  id: string;
  numero: number;
  carpeta: string;
  estado: "ejecutando" | "terminado";
  totalArchivos: number;
  inicio: number;
  fin: number | null;
  tieneExcel: boolean;
  metricas: Partial<Metricas>;
}

export interface DatosMetricas {
  lotes: LoteMetricas[];
  clientesEnBase: number;
}

/**
 * Carga las métricas de todos los lotes (1 lectura por lote). Con `intervaloMs` se refresca solo,
 * pero únicamente con la pestaña visible y mientras haya lotes procesándose, y se refresca al instante cuando el motor avisa que un lote
 * empezó o terminó.
 */
export function useMetricas(intervaloMs: number | null) {
  const [datos, setDatos] = useState<DatosMetricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ultimos = useRef<DatosMetricas | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch("/api/metricas", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as DatosMetricas;
      ultimos.current = d;
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const inicial = setTimeout(() => void refrescar(), 0); // carga inicial (fuera del cuerpo síncrono del efecto)
    const alCambiar = () => void refrescar();
    window.addEventListener("lote-iniciado", alCambiar);
    window.addEventListener("lote-terminado", alCambiar);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("lote-iniciado", alCambiar);
      window.removeEventListener("lote-terminado", alCambiar);
    };
  }, [refrescar]);

  useEffect(() => {
    if (!intervaloMs) return;
    const t = setInterval(() => {
      // Solo mientras haya lotes procesándose (si no, no cambia nada y cada consulta cuesta lecturas).
      const hayTrabajo = ultimos.current === null || ultimos.current.lotes.some((l) => l.estado === "ejecutando");
      if (document.visibilityState === "visible" && hayTrabajo) void refrescar();
    }, intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs, refrescar]);

  return { datos, error, cargando, refrescar };
}
