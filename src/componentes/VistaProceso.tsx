"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const CONCURRENCIA_LOTES = 3; // cada llamada concurrente es otra instancia de la función en Vercel
const SONDEO_MS = 4000; // cada sondeo cuesta ~7 lecturas de Firestore: no bajar de 3-4 s

interface Avance {
  terminados: number; aceptadas: number; revision: number; duplicadas: number; errores: number;
  clientesNuevos: number; clientesExistentes: number; lecturasEstimadas: number;
}
interface Estado {
  id: string; carpeta: string; estado: "subiendo" | "ejecutando" | "terminado" | "error" | "en_cola";
  totalArchivos: number; inicio: number; fin: number | null; tieneExcel: boolean; avance: Avance | null;
}
interface FilaFactura {
  hash: string; archivo: string; numero: string | null; fecha: string | null; proveedor: string | null;
  clienteDocumento: string | null; clienteNombre: string | null; total: number | null; estado: "aceptada" | "revision"; motivos: string[];
}

const cop = (n: number | null) => (n === null ? "—" : "$" + n.toLocaleString("es-CO"));
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function VistaProceso({ id }: { id: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<FilaFactura[] | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "aceptada" | "revision">("todas");
  const [lecturas, setLecturas] = useState(0);
  const [ahora, setAhora] = useState(0); // se actualiza con cada sondeo (Date.now() no puede llamarse al renderizar)
  const corriendo = useRef(false);

  const consultar = useCallback(async (): Promise<Estado | null> => {
    const r = await fetch(`/api/procesos/${id}`);
    if (r.status === 401) { router.replace("/login"); return null; }
    if (!r.ok) { setMensaje("No se encontró el proceso"); return null; }
    const e = (await r.json()) as Estado;
    setEstado(e);
    setAhora(Date.now());
    if (e.avance) setLecturas((l) => l + e.avance!.lecturasEstimadas);
    return e;
  }, [id, router]);

  // Sondeo del avance: se detiene al terminar o con la pestaña oculta (ahorra lecturas de Firestore).
  useEffect(() => {
    let vivo = true;
    (async () => {
      while (vivo) {
        if (document.visibilityState === "visible") {
          const e = await consultar().catch(() => null);
          if (e?.estado === "terminado" || e?.estado === "error") break;
        }
        await dormir(SONDEO_MS);
      }
    })();
    return () => { vivo = false; };
  }, [consultar]);

  // Bucle de trabajo: 3 llamadas /lote concurrentes hasta que no queda nada; luego /finalizar.
  // Si el usuario cierra la pestaña y vuelve, este bucle continúa donde quedó (todo es idempotente).
  const estadoActual = estado?.estado;
  useEffect(() => {
    if (estadoActual !== "ejecutando" || corriendo.current) return;
    corriendo.current = true;
    let cancelado = false;
    (async () => {
      let fallosSeguidos = 0;
      while (!cancelado) {
        await Promise.all(
          Array.from({ length: CONCURRENCIA_LOTES }, async () => {
            while (!cancelado) {
              try {
                const r = await fetch(`/api/procesos/${id}/lote`, { method: "POST" });
                if (!r.ok) throw new Error(`lote ${r.status}`);
                const d = (await r.json()) as { reclamados: number };
                fallosSeguidos = 0;
                if (d.reclamados === 0) return;
              } catch {
                if (++fallosSeguidos > 8) { setMensaje("Demasiados errores seguidos; recarga la página para continuar."); cancelado = true; return; }
                await dormir(2000);
              }
            }
          }),
        );
        if (cancelado) break;
        const f = await fetch(`/api/procesos/${id}/finalizar`, { method: "POST" }).then((r) => r.json()).catch(() => null) as { listo?: boolean } | null;
        if (f?.listo) { await consultar(); break; }
        await dormir(5000); // quedan archivos en proceso en otra llamada, o un arrendamiento por caducar
      }
      corriendo.current = false;
    })();
    return () => { cancelado = true; corriendo.current = false; };
  }, [estadoActual, id, consultar]);

  // Resultados: solo cuando termina (leer las facturas cuesta ~2 lecturas por factura).
  useEffect(() => {
    if (estadoActual !== "terminado" || facturas) return;
    fetch(`/api/procesos/${id}/facturas`).then((r) => r.json()).then((d: { facturas: FilaFactura[] }) => setFacturas(d.facturas)).catch(() => setFacturas([]));
  }, [estadoActual, id, facturas]);

  const a = estado?.avance;
  const total = estado?.totalArchivos ?? 0;
  const visibles = (facturas ?? []).filter((f) => filtro === "todas" || f.estado === filtro);
  const segundos = estado ? Math.max(0, Math.round(((estado.fin ?? ahora) - estado.inicio) / 1000)) : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 py-6">
      <p><Link className="underline text-sm" href="/">← Nuevo proceso</Link></p>
      <h1 className="text-2xl font-semibold">Proceso: {estado?.carpeta ?? "…"}</h1>
      {mensaje && <p role="alert" className="text-red-600">{mensaje}</p>}

      {estado && (
        <section className="flex flex-col gap-2">
          <p className="text-sm">
            Estado: <b>{estado.estado}</b>
            {estado.estado === "ejecutando" ? " — procesando; puedes cerrar la pestaña y volver, continúa donde quedó." : ""}
          </p>
          {total > 0 && (
            <>
              <progress className="w-full" value={a?.terminados ?? 0} max={total} />
              <p className="text-sm">{a?.terminados ?? 0} de {total} facturas procesadas · {segundos} s</p>
            </>
          )}
          {a && (
            <ul className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4">
              <li>Aceptadas: <b>{a.aceptadas}</b></li>
              <li>En revisión: <b>{a.revision}</b></li>
              <li>Duplicadas: <b>{a.duplicadas}</b></li>
              <li>Con error: <b>{a.errores}</b></li>
              <li>Clientes nuevos: <b>{a.clientesNuevos}</b></li>
              <li>Clientes existentes: <b>{a.clientesExistentes}</b></li>
              <li className="opacity-60">Lecturas estimadas (sondeo): ~{lecturas}</li>
            </ul>
          )}
          {estado.tieneExcel && (
            <p>
              Excel disponible:{" "}
              <a className="underline font-medium" href={`/api/procesos/${id}/excel`}>descargar</a>
            </p>
          )}
        </section>
      )}

      {facturas && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Facturas ({visibles.length})</h2>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="rounded border border-zinc-400 bg-transparent px-2 py-1 text-sm">
              <option value="todas">Todas</option>
              <option value="aceptada">Aceptadas</option>
              <option value="revision">En revisión</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-400">
                  <th className="py-1 pr-3">Archivo</th><th className="pr-3">Número</th><th className="pr-3">Fecha</th>
                  <th className="pr-3">Proveedor</th><th className="pr-3">Cliente</th><th className="pr-3 text-right">Total</th><th className="pr-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.hash} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-1 pr-3"><a className="underline" target="_blank" href={`/api/facturas/${f.hash}/imagen`}>{f.archivo}</a></td>
                    <td className="pr-3">{f.numero ?? "—"}</td>
                    <td className="pr-3">{f.fecha ?? "—"}</td>
                    <td className="pr-3">{f.proveedor ?? "—"}</td>
                    <td className="pr-3">{f.clienteNombre ?? "—"}{f.clienteDocumento ? <span className="opacity-60"> ({f.clienteDocumento})</span> : null}</td>
                    <td className="pr-3 text-right">{cop(f.total)}</td>
                    <td className="pr-3">
                      {f.estado === "aceptada" ? "Aceptada" : <span title={f.motivos.join("\n")} className="text-amber-600 underline decoration-dotted">Revisión</span>}
                      {f.estado === "revision" && <div className="max-w-xs text-xs opacity-70">{f.motivos[0]}</div>}
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
