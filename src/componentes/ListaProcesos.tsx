"use client";

import Link from "next/link";
import { useEffect } from "react";
import { fechaHora, num } from "./formato";
import { useMetricas } from "./useMetricas";

/** Lotes anteriores (con su número, fecha y avance). Usa los mismos datos baratos que el panel de métricas. */
export function ListaProcesos() {
  const { datos, refrescar } = useMetricas(null);
  useEffect(() => {
    const alBorrar = () => void refrescar();
    window.addEventListener("datos-borrados", alBorrar);
    return () => window.removeEventListener("datos-borrados", alBorrar);
  }, [refrescar]);
  const lotes = [...(datos?.lotes ?? [])].reverse();
  if (lotes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-5">
      <h2 className="text-lg font-semibold">Lotes anteriores</h2>
      <ul className="flex flex-col divide-y divide-borde text-sm">
        {lotes.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link className="font-medium underline" href={`/procesos/${l.id}`}>Lote {l.numero} · {l.carpeta}</Link>
            <span className="cifra text-texto2">{fechaHora(l.inicio)} · {num(l.totalArchivos)} facturas · {l.estado === "terminado" ? "terminado" : "procesando"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
