"use client";

// Detalle de UN lote: avance en vivo (con antes de IVA, IVA e impoconsumo), Excel y tabla de facturas.
// El trabajo lo hace el Motor del layout; esta vista solo muestra.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Metricas } from "@/lib/modelo/tipos";
import { calcularTasas, sumarMetricas } from "@/lib/procesamiento/metricas";
import { cop, dormir, fechaHora, num, pct } from "./formato";
import { Cifra, Girando, IconoMal, IconoOk, Progreso, botonPrimario } from "./ui";

const SONDEO_MS = 4000;

interface Estado {
  id: string; carpeta: string; estado: "subiendo" | "ejecutando" | "terminado" | "error" | "en_cola";
  totalArchivos: number; inicio: number; fin: number | null; tieneExcel: boolean; metricas: Partial<Metricas>;
}
interface FilaFactura {
  hash: string; archivo: string; numero: string | null; fecha: string | null; proveedor: string | null;
  clienteDocumento: string | null; clienteNombre: string | null; subtotal: number | null; iva: number | null;
  impoconsumo: number; total: number | null; estado: "aceptada" | "revision"; motivos: string[];
}

export function VistaProceso({ id }: { id: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<FilaFactura[] | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "aceptada" | "revision">("todas");
  const [ahora, setAhora] = useState(0);

  const consultar = useCallback(async (): Promise<Estado | null> => {
    const r = await fetch(`/api/procesos/${id}`, { cache: "no-store" });
    if (r.status === 401) { router.replace("/login"); return null; }
    if (!r.ok) { setMensaje("No se encontró este lote (¿se borraron los datos?)"); return null; }
    const e = (await r.json()) as Estado;
    setEstado(e);
    setAhora(Date.now());
    return e;
  }, [id, router]);

  // Sondeo barato (el documento del lote ya trae los contadores); se detiene al terminar o con la pestaña oculta.
  useEffect(() => {
    let vivo = true;
    (async () => {
      while (vivo) {
        if (document.visibilityState === "visible") {
          const e = await consultar().catch(() => null);
          if (!e || e.estado === "terminado" || e.estado === "error") break;
        }
        await dormir(SONDEO_MS);
      }
    })();
    return () => { vivo = false; };
  }, [consultar]);

  const terminado = estado?.estado === "terminado";
  // Las facturas se leen una vez, al terminar (cuesta ~2 lecturas por factura).
  useEffect(() => {
    if (!terminado || facturas) return;
    fetch(`/api/procesos/${id}/facturas`).then((r) => r.json()).then((d: { facturas: FilaFactura[] }) => setFacturas(d.facturas)).catch(() => setFacturas([]));
  }, [terminado, id, facturas]);

  const m = sumarMetricas([estado?.metricas]);
  const t = calcularTasas(m);
  const total = estado?.totalArchivos ?? 0;
  const hechas = t.total + m.duplicadas;
  const visibles = (facturas ?? []).filter((f) => filtro === "todas" || f.estado === filtro);
  const segundos = estado ? Math.max(0, Math.round(((estado.fin ?? ahora) - estado.inicio) / 1000)) : 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <p><Link className="text-sm underline" href="/">← Procesar facturas</Link></p>
      <h1 className="text-2xl font-semibold tracking-tight">Lote: {estado?.carpeta ?? "…"}</h1>
      {mensaje && <p role="alert" className="text-malo">{mensaje}</p>}

      {estado && (
        <section className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              {terminado ? <><IconoOk className="text-bueno" /> Terminado</> : <><Girando className="text-acento" /> Procesando (en segundo plano)</>}
            </span>
            <span className="cifra text-texto2">{fechaHora(estado.inicio)} · {segundos} s</span>
          </div>
          <div>
            <Progreso valor={hechas} max={total} etiqueta="Facturas procesadas" />
            <p className="cifra mt-1 text-sm text-texto2">{num(hechas)} de {num(total)} facturas procesadas</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra etiqueta="Antes de IVA" valor={cop(m.aceptadas.subtotal + m.revision.subtotal)} />
            <Cifra etiqueta="IVA" valor={cop(m.aceptadas.iva + m.revision.iva)} />
            <Cifra etiqueta="Impoconsumo" valor={cop(m.aceptadas.impoconsumo + m.revision.impoconsumo)} />
            <Cifra etiqueta="Total" valor={cop(m.aceptadas.total + m.revision.total)} />
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li className="inline-flex items-center gap-1"><IconoOk className="text-bueno" /> Leídas correctamente: <b className="cifra">{num(t.correctas)}</b> ({pct(t.pctCorrectas)})</li>
            <li className="inline-flex items-center gap-1"><IconoMal className="text-malo" /> A revisión / mal leídas: <b className="cifra">{num(t.malLeidas)}</b> ({pct(t.pctMalLeidas)})</li>
            <li>Duplicadas: <b className="cifra">{num(m.duplicadas)}</b></li>
            <li>Clientes nuevos: <b className="cifra">{num(m.clientesNuevos)}</b></li>
          </ul>
          {estado.tieneExcel && (
            <p><a className={botonPrimario} href={`/api/procesos/${id}/excel`}>Descargar Excel</a></p>
          )}
        </section>
      )}

      {facturas && (
        <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Facturas ({num(visibles.length)})</h2>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm" aria-label="Filtrar por estado">
              <option value="todas">Todas</option>
              <option value="aceptada">Aceptadas</option>
              <option value="revision">En revisión</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-borde text-texto2">
                  <th className="py-2 pr-3 font-medium">Archivo</th><th className="pr-3 font-medium">Número</th><th className="pr-3 font-medium">Fecha</th>
                  <th className="pr-3 font-medium">Razón social</th><th className="pr-3 text-right font-medium">Antes de IVA</th>
                  <th className="pr-3 text-right font-medium">IVA</th><th className="pr-3 text-right font-medium">Impoconsumo</th>
                  <th className="pr-3 text-right font-medium">Total</th><th className="font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.hash} className="border-b border-borde/60 align-top">
                    <td className="py-2 pr-3"><a className="underline" target="_blank" rel="noreferrer" href={`/api/facturas/${f.hash}/imagen`}>{f.archivo}</a></td>
                    <td className="cifra whitespace-nowrap pr-3">{f.numero ?? "—"}</td>
                    <td className="cifra whitespace-nowrap pr-3">{f.fecha ?? "—"}</td>
                    <td className="pr-3">{f.proveedor ?? "—"}</td>
                    <td className="cifra pr-3 text-right">{cop(f.subtotal)}</td>
                    <td className="cifra pr-3 text-right">{cop(f.iva)}</td>
                    <td className="cifra pr-3 text-right">{cop(f.impoconsumo)}</td>
                    <td className="cifra pr-3 text-right">{cop(f.total)}</td>
                    <td>
                      {f.estado === "aceptada"
                        ? <span className="inline-flex items-center gap-1"><IconoOk className="text-bueno" /> Aceptada</span>
                        : <span className="inline-flex items-center gap-1" title={f.motivos.join("\n")}><IconoMal className="text-malo" /> Revisión</span>}
                      {f.estado === "revision" && <div className="max-w-xs text-xs text-texto2">{f.motivos[0]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
