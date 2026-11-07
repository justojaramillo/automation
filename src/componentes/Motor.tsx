"use client";

// Motor de procesamiento en segundo plano. Vive en el layout, así que sigue trabajando mientras el
// usuario sube otro lote o cambia entre "Procesar" y "Métricas". Reparte 3 llamadas /lote concurrentes
// (cada una es otra instancia de la función en Vercel) entre los lotes en ejecución, uno tras otro,
// y finaliza cada lote (Excel) cuando no queda nada. Todo es idempotente: si se cierra la pestaña, al
// volver a abrir cualquier página el motor retoma los lotes `ejecutando` donde quedaron.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dormir } from "./formato";
import { Girando } from "./ui";

const CONCURRENCIA = 3;
const RECHEQUEO_MS = 30_000; // un lote "agotado" se vuelve a mirar por si caducó el arrendamiento de otro

export function Motor() {
  const router = useRouter();
  const [activos, setActivos] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ids = new Set<string>();
    const agotado = new Map<string, number>();
    const finalizando = new Set<string>();
    const sincronizar = () => setActivos(ids.size);
    const agregar = (id: string) => {
      if (!ids.has(id)) { ids.add(id); agotado.delete(id); sincronizar(); }
    };
    const quitar = (id: string) => {
      ids.delete(id); agotado.delete(id); finalizando.delete(id); sincronizar();
    };

    // Descubre los lotes que quedaron en ejecución (p. ej. se cerró la pestaña a mitad).
    fetch("/api/procesos?estado=ejecutando")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { procesos: { id: string }[] } | null) => d?.procesos.forEach((p) => agregar(p.id)))
      .catch(() => undefined);

    const alIniciar = (e: Event) => agregar((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("lote-iniciado", alIniciar);

    const elegir = (): string | null => {
      const ahora = Date.now();
      for (const id of ids) {
        const t = agotado.get(id);
        if (t === undefined || ahora - t > RECHEQUEO_MS) return id;
      }
      return null;
    };

    async function finalizar(id: string) {
      if (finalizando.has(id)) return;
      finalizando.add(id);
      while (vivo && ids.has(id)) {
        const r = await fetch(`/api/procesos/${id}/finalizar`, { method: "POST" }).catch(() => null);
        if (r && (r.status === 404 || r.status === 409)) { quitar(id); return; }
        const f = r?.ok ? ((await r.json().catch(() => null)) as { listo?: boolean } | null) : null;
        if (f?.listo) {
          quitar(id);
          window.dispatchEvent(new CustomEvent("lote-terminado", { detail: { id } }));
          return;
        }
        await dormir(5000); // quedan archivos en proceso en otra llamada, o un arrendamiento por caducar
      }
      finalizando.delete(id);
    }

    async function trabajador() {
      let fallos = 0;
      while (vivo) {
        const id = elegir();
        if (!id) { await dormir(2000); continue; }
        try {
          const r = await fetch(`/api/procesos/${id}/lote`, { method: "POST" });
          if (r.status === 401) { vivo = false; router.replace("/login"); return; }
          if (r.status === 404) { quitar(id); continue; } // el lote se borró
          if (!r.ok) throw new Error(`lote ${r.status}`);
          const d = (await r.json()) as { reclamados: number; estado?: string };
          fallos = 0;
          if (d.estado && d.estado !== "ejecutando") { quitar(id); continue; }
          if (d.reclamados === 0) { agotado.set(id, Date.now()); void finalizar(id); }
        } catch {
          fallos++;
          await dormir(Math.min(30_000, 2000 * fallos)); // no se rinde: espera más cada vez y reintenta
        }
      }
    }

    for (let i = 0; i < CONCURRENCIA; i++) void trabajador();
    return () => {
      vivo = false;
      window.removeEventListener("lote-iniciado", alIniciar);
    };
  }, [router]);

  if (activos === 0) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-3 py-1 text-xs" role="status">
      <Girando className="text-acento" />
      Procesando {activos} {activos === 1 ? "lote" : "lotes"}…
    </span>
  );
}
