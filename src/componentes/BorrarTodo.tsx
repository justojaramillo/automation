"use client";

import { useState } from "react";
import { num } from "./formato";
import { botonSecundario } from "./ui";

interface Resultado {
  borrados: Record<string, number>;
  archivosBlob: number;
}

export function BorrarTodo({ alBorrar }: { alBorrar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [hayEjecucion, setHayEjecucion] = useState(false);

  async function borrar(forzar: boolean) {
    setTrabajando(true);
    setError(null);
    setResultado(null);
    try {
      const r = await fetch("/api/datos/borrar", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmacion: texto, forzar }),
      });
      const d = (await r.json().catch(() => ({}))) as Partial<Resultado> & { error?: string; enEjecucion?: number };
      if (r.status === 409) { setHayEjecucion(true); setError(`Hay ${d.enEjecucion} lote(s) procesándose. Si borras ahora se interrumpen.`); return; }
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
      setResultado(d as Resultado);
      setHayEjecucion(false);
      setAbierto(false);
      setTexto("");
      alBorrar?.();
      window.dispatchEvent(new CustomEvent("datos-borrados"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-malo/50 bg-superficie p-5">
      <div>
        <h2 className="text-lg font-semibold">Zona de pruebas</h2>
        <p className="text-sm text-texto2">
          Borra <b>todo</b> lo guardado (de todos los usuarios): facturas, clientes, lotes, métricas, imágenes y Excel. No se puede deshacer.
        </p>
      </div>
      {!abierto ? (
        <button className={`${botonSecundario} self-start border-malo text-malo`} onClick={() => setAbierto(true)} data-testid="borrar-abrir">
          Borrar todas las facturas y registros…
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-sm">
            Escribe <b>BORRAR</b> para confirmar
            <input
              value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" data-testid="borrar-texto"
              className="mt-1 block w-48 rounded-md border border-borde bg-superficie px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => borrar(hayEjecucion)} disabled={texto !== "BORRAR" || trabajando} data-testid="borrar-confirmar"
              className="rounded-md bg-malo px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {trabajando ? "Borrando…" : hayEjecucion ? "Borrar de todos modos" : "Borrar todo"}
            </button>
            <button className={botonSecundario} onClick={() => { setAbierto(false); setTexto(""); setError(null); }} disabled={trabajando}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-malo">{error}</p>}
      {resultado && (
        <p role="status" className="cifra text-sm">
          Listo: se borraron {num(resultado.borrados.facturas ?? 0)} facturas, {num(resultado.borrados.clientes ?? 0)} clientes,{" "}
          {num(resultado.borrados.procesos ?? 0)} lotes y {num(resultado.archivosBlob)} archivos.
        </p>
      )}
    </section>
  );
}
