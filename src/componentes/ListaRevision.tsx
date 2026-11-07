"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cop, num } from "./formato";
import { IconoOk, botonPrimario } from "./ui";
import { useMetricas } from "./useMetricas";

interface Pendiente { hash: string; archivo: string; procesoId: string; numero: string | null; proveedor: string | null; total: number | null; motivos: string[]; confianzaOcr: number }

/** Facturas que la máquina no pudo aceptar y esperan a una persona. */
export function ListaRevision() {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { datos } = useMetricas(null);
  const numeroDeLote = new Map((datos?.lotes ?? []).map((l) => [l.id, l.numero]));

  useEffect(() => {
    let vivo = true;
    fetch("/api/facturas", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`Error ${r.status}`); return (await r.json()) as { facturas: Pendiente[]; hayMas: boolean }; })
      .then((d) => { if (vivo) { setPendientes(d.facturas); setHayMas(d.hayMas); } })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "Error"));
    return () => { vivo = false; };
  }, []);

  if (error) return <p role="alert" className="text-malo">No se pudo cargar la lista ({error}).</p>;
  if (!pendientes) return <p className="text-texto2">Cargando…</p>;
  if (pendientes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-borde bg-superficie p-6">
        <p className="flex items-center gap-2 text-lg font-medium"><IconoOk className="text-bueno" /> No hay facturas pendientes de revisión.</p>
        <p className="text-texto2">Todo lo que la máquina no pudo leer ya fue revisado por una persona.</p>
        <Link href="/metricas" className="underline">Ver métricas</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-3">
        <b className="cifra text-lg">{num(pendientes.length)}{hayMas ? "+" : ""} {pendientes.length === 1 ? "factura espera" : "facturas esperan"} a una persona</b>
        <Link href={`/revision/${pendientes[0].hash}`} className={botonPrimario} data-testid="empezar">Empezar por la primera</Link>
      </p>
      <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
        <table className="w-full text-left text-sm" data-testid="tabla-revision">
          <thead>
            <tr className="border-b border-borde text-texto2">
              <th className="p-3 font-medium">Archivo</th><th className="pr-3 font-medium">Lote</th><th className="pr-3 font-medium">Qué falló</th>
              <th className="pr-3 text-right font-medium">Total leído</th><th className="pr-3 font-medium"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((f) => (
              <tr key={f.hash} className="border-b border-borde/60 align-top">
                <td className="p-3 font-medium">{f.archivo}</td>
                <td className="cifra pr-3">{numeroDeLote.get(f.procesoId) ?? "—"}</td>
                <td className="pr-3">{f.motivos[0] ?? "—"}{f.motivos.length > 1 && <span className="text-texto2"> (+{f.motivos.length - 1} más)</span>}</td>
                <td className="cifra pr-3 text-right">{cop(f.total)}</td>
                <td className="pr-3 py-2"><Link className="underline" href={`/revision/${f.hash}`}>Revisar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hayMas && <p className="text-sm text-texto2">Se muestran las primeras 200; al resolverlas aparecerán las demás.</p>}
    </div>
  );
}
