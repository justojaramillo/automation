"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calcularTasas, proveedoresOrdenados, sumarMetricas } from "@/lib/procesamiento/metricas";
import { cop, fechaHora, num, pct } from "./formato";
import { Cifra, Girando, IconoMal, IconoOk, Medidor, botonSecundario } from "./ui";
import { useMetricas } from "./useMetricas";

/** Barra fina de dos tramos (leídas bien / mal leídas) para leer la proporción al lado de sus cifras. */
function BarraProporcion({ buenas, malas }: { buenas: number; malas: number }) {
  const total = buenas + malas;
  if (total === 0) return <div className="h-2 w-28 rounded-full bg-pista" aria-hidden />;
  return (
    <div className="flex h-2 w-28 gap-0.5 overflow-hidden rounded-full bg-pista" aria-hidden>
      <div className="bg-bueno" style={{ width: `${(buenas / total) * 100}%` }} />
      <div className="bg-malo" style={{ width: `${(malas / total) * 100}%` }} />
    </div>
  );
}

export function PanelMetricas() {
  const { datos, error, cargando, refrescar } = useMetricas(8000);
  const [seleccion, setSeleccion] = useState<string>("todos");

  useEffect(() => {
    const alBorrar = () => { setSeleccion("todos"); void refrescar(); };
    window.addEventListener("datos-borrados", alBorrar);
    return () => window.removeEventListener("datos-borrados", alBorrar);
  }, [refrescar]);

  const lotes = useMemo(() => datos?.lotes ?? [], [datos]);
  const elegidos = useMemo(() => (seleccion === "todos" ? lotes : lotes.filter((l) => l.id === seleccion)), [lotes, seleccion]);
  const m = useMemo(() => sumarMetricas(elegidos.map((l) => l.metricas)), [elegidos]);
  const t = calcularTasas(m);
  const proveedores = proveedoresOrdenados(m);
  // Lo aceptado por la máquina más lo que una persona ingresó o corrigió a mano.
  const procesado = {
    n: m.aceptadas.n + m.manuales.n, subtotal: m.aceptadas.subtotal + m.manuales.subtotal, iva: m.aceptadas.iva + m.manuales.iva,
    impoconsumo: m.aceptadas.impoconsumo + m.manuales.impoconsumo, total: m.aceptadas.total + m.manuales.total,
  };
  const maxProveedor = Math.max(1, ...proveedores.map((p) => p.total));
  const procesando = lotes.some((l) => l.estado === "ejecutando");
  const etiquetaSeleccion = seleccion === "todos" ? `todos los lotes (${lotes.length})` : `el lote ${elegidos[0]?.numero ?? ""}`;

  if (cargando && !datos) return <p className="px-4 py-8 text-texto2">Cargando métricas…</p>;
  if (error && !datos) return <p role="alert" className="px-4 py-8 text-malo">No se pudieron cargar las métricas ({error}).</p>;

  if (lotes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-borde bg-superficie p-6">
        <p className="text-lg font-medium">Todavía no hay facturas procesadas.</p>
        <p className="text-texto2">Sube un lote y aquí verás cuánto se procesó y qué tan bien se leyó.</p>
        <Link href="/" className="rounded-md bg-acento px-4 py-2 text-sm font-medium text-acento-texto">Ir a procesar facturas</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Mostrando
          <select
            value={seleccion} onChange={(e) => setSeleccion(e.target.value)} data-testid="selector-lote"
            className="rounded-md border border-borde bg-superficie px-2 py-1.5"
          >
            <option value="todos">Todos los lotes ({lotes.length})</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>Lote {l.numero} · {l.carpeta} · {num(l.totalArchivos)} facturas</option>
            ))}
          </select>
        </label>
        <button className={botonSecundario} onClick={() => void refrescar()}>Actualizar</button>
        {procesando && <span className="inline-flex items-center gap-2 text-sm text-texto2"><Girando className="text-acento" /> Hay lotes procesándose; se actualiza solo.</span>}
      </div>

      <section aria-labelledby="h-calidad" className="flex flex-col gap-3">
        <h2 id="h-calidad" className="text-lg font-semibold">Calidad de la lectura · {etiquetaSeleccion}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Medidor etiqueta="Leídas correctamente" tono="bueno" porcentaje={t.pctCorrectas} n={t.correctas} total={t.total} />
          <Medidor etiqueta="Mal leídas (a revisión)" tono="malo" porcentaje={t.pctMalLeidas} n={t.malLeidas} total={t.total} />
          <Cifra etiqueta="Facturas procesadas" valor={num(t.total)} detalle={`${num(m.revision.n)} en revisión · ${num(m.errores)} con error`} />
          <Cifra etiqueta="Duplicadas (ya estaban)" valor={num(m.duplicadas)} detalle={`Clientes en la base: ${num(datos?.clientesEnBase ?? 0)}`} />
        </div>
        {t.malLeidas > 0 && (
          <p className="rounded-lg border border-borde bg-superficie p-3 text-sm" data-testid="aviso-pendientes">
            De las {num(t.malLeidas)} mal leídas, <b className="cifra">{num(t.revisadasAMano)}</b> ya se revisaron a mano y <b className="cifra">{num(t.pendientes)}</b> esperan a una persona.
            {t.pendientes > 0 && <Link href="/revision" className="ml-3 font-medium underline">Revisar las pendientes →</Link>}
          </p>
        )}
        <p className="text-xs text-texto2">
          «Leída correctamente» = pasó todas las validaciones (IVA 19 %, impoconsumo 4 %, sumas, dígito de verificación del NIT…). No se compara con una respuesta conocida,
          así que un error que cuadre aritméticamente podría pasar. Los porcentajes miden a la máquina: lo que una persona revisa a mano no los cambia. Las duplicadas no cuentan.
        </p>
      </section>

      <section aria-labelledby="h-montos" className="flex flex-col gap-3">
        <h2 id="h-montos" className="text-lg font-semibold">Lo procesado · aceptadas y revisadas a mano</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra grande etiqueta="Antes de IVA" valor={cop(procesado.subtotal)} />
          <Cifra grande etiqueta="IVA" valor={cop(procesado.iva)} />
          <Cifra grande etiqueta="Impoconsumo" valor={cop(procesado.impoconsumo)} />
          <Cifra grande etiqueta="Total" valor={cop(procesado.total)} detalle={`${num(procesado.n)} facturas · ${num(m.manuales.n)} revisadas a mano`} />
        </div>
        {t.pendientes > 0 && (
          <p className="cifra text-sm text-texto2">
            Hay {num(t.pendientes)} facturas pendientes de revisión: no están incluidas arriba hasta que una persona las revise.
          </p>
        )}
      </section>

      <section aria-labelledby="h-prov" className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-5">
        <h2 id="h-prov" className="text-lg font-semibold">Por razón social · {etiquetaSeleccion}</h2>
        {proveedores.length === 0 ? (
          <p className="text-sm text-texto2">Aún no hay facturas aceptadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="tabla-proveedores">
              <thead>
                <tr className="border-b border-borde text-texto2">
                  <th className="py-2 pr-3 font-medium">Razón social</th><th className="pr-3 font-medium">NIT</th>
                  <th className="pr-3 text-right font-medium">Facturas</th><th className="pr-3 text-right font-medium">Antes de IVA</th>
                  <th className="pr-3 text-right font-medium">IVA</th><th className="pr-3 text-right font-medium">Impoconsumo</th>
                  <th className="pr-3 text-right font-medium">Total</th><th className="w-32 font-medium"><span className="sr-only">Participación</span></th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) => (
                  <tr key={p.nit} className="border-b border-borde/60">
                    <td className="py-2 pr-3 font-medium">{p.nombre}</td>
                    <td className="cifra pr-3 text-texto2">{p.nit}</td>
                    <td className="cifra pr-3 text-right">{num(p.n)}</td>
                    <td className="cifra pr-3 text-right">{cop(p.subtotal)}</td>
                    <td className="cifra pr-3 text-right">{cop(p.iva)}</td>
                    <td className="cifra pr-3 text-right">{cop(p.impoconsumo)}</td>
                    <td className="cifra pr-3 text-right">{cop(p.total)}</td>
                    <td aria-hidden><div className="h-2 rounded-full bg-pista"><div className="h-2 rounded-full bg-acento" style={{ width: `${(p.total / maxProveedor) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={2}>Total</td>
                  <td className="cifra pr-3 text-right">{num(proveedores.reduce((a, p) => a + p.n, 0))}</td>
                  <td className="cifra pr-3 text-right">{cop(proveedores.reduce((a, p) => a + p.subtotal, 0))}</td>
                  <td className="cifra pr-3 text-right">{cop(proveedores.reduce((a, p) => a + p.iva, 0))}</td>
                  <td className="cifra pr-3 text-right">{cop(proveedores.reduce((a, p) => a + p.impoconsumo, 0))}</td>
                  <td className="cifra pr-3 text-right">{cop(proveedores.reduce((a, p) => a + p.total, 0))}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-texto2">Solo facturas aceptadas o revisadas a mano: en las que esperan revisión, el NIT o el nombre pueden estar mal leídos.</p>
      </section>

      <section aria-labelledby="h-lotes" className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-5">
        <h2 id="h-lotes" className="text-lg font-semibold">Métricas por lote</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="tabla-lotes">
            <thead>
              <tr className="border-b border-borde text-texto2">
                <th className="py-2 pr-3 font-medium">Lote</th><th className="pr-3 font-medium">Fecha</th>
                <th className="pr-3 text-right font-medium">Facturas</th>
                <th className="pr-3 font-medium"><span className="inline-flex items-center gap-1"><IconoOk className="text-bueno" /> Correctas</span></th>
                <th className="pr-3 font-medium"><span className="inline-flex items-center gap-1"><IconoMal className="text-malo" /> Mal leídas</span></th>
                <th className="pr-3 font-medium"><span className="sr-only">Proporción</span></th>
                <th className="pr-3 text-right font-medium">Total procesado</th><th className="font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const lm = sumarMetricas([l.metricas]);
                const lt = calcularTasas(lm);
                return (
                  <tr key={l.id} className={`border-b border-borde/60 ${seleccion === l.id ? "bg-pista/60" : ""}`}>
                    <td className="py-2 pr-3">
                      <button className="font-medium underline" onClick={() => setSeleccion(l.id)}>Lote {l.numero}</button>
                      <span className="ml-2 text-texto2">{l.carpeta}</span>
                    </td>
                    <td className="cifra pr-3 text-texto2">{fechaHora(l.inicio)}</td>
                    <td className="cifra pr-3 text-right">{num(l.totalArchivos)}</td>
                    <td className="cifra pr-3">{num(lt.correctas)} · {pct(lt.pctCorrectas)}</td>
                    <td className="cifra pr-3">{num(lt.malLeidas)} · {pct(lt.pctMalLeidas)}{lt.malLeidas > 0 && <div className="text-xs text-texto2">{num(lt.pendientes)} por revisar</div>}</td>
                    <td className="pr-3"><BarraProporcion buenas={lt.correctas} malas={lt.malLeidas} /></td>
                    <td className="cifra pr-3 text-right">{cop(lm.aceptadas.total + lm.manuales.total)}</td>
                    <td>
                      {l.estado === "terminado" ? "Terminado" : <span className="inline-flex items-center gap-1"><Girando className="text-acento" /> Procesando</span>}
                      {l.tieneExcel && <> · <a className="underline" href={`/api/procesos/${l.id}/excel`}>Excel</a></>}
                      {" · "}<Link className="underline" href={`/procesos/${l.id}`}>Detalle</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
