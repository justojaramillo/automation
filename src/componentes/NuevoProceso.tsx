"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EXTENSIONES_IMAGEN, pathnameDeSubida } from "@/lib/rutas";

const CONCURRENCIA_SUBIDA = 6;
const REINTENTOS = 3;
const LIMITE_POR_DEFECTO = 20; // cuota de Firestore: pocas facturas por defecto
const LIMITE_AVISO = 50;

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function conReintentos<T>(tarea: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < REINTENTOS; i++) {
    try {
      return await tarea();
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw ultimo;
}

export function NuevoProceso() {
  const router = useRouter();
  const [imagenes, setImagenes] = useState<File[]>([]);
  const [carpeta, setCarpeta] = useState("");
  const [limite, setLimite] = useState<string>(String(LIMITE_POR_DEFECTO));
  const [subidas, setSubidas] = useState(0);
  const [fase, setFase] = useState<"espera" | "subiendo" | "iniciando">("espera");
  const [error, setError] = useState<string | null>(null);
  const ocupado = useRef(false);

  function elegir(archivos: FileList | null) {
    const lista = [...(archivos ?? [])].filter((f) => EXTENSIONES_IMAGEN.test(f.name));
    lista.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    setImagenes(lista);
    setCarpeta(lista[0]?.webkitRelativePath.split("/")[0] ?? "");
    setError(null);
  }

  const n = Math.min(imagenes.length, Number(limite) > 0 ? Number(limite) : imagenes.length);
  const seleccion = imagenes.slice(0, n);
  const tamano = seleccion.reduce((a, f) => a + f.size, 0);

  async function procesar() {
    if (ocupado.current || seleccion.length === 0) return;
    if (seleccion.length > LIMITE_AVISO && !confirm(`Vas a procesar ${seleccion.length} facturas. Consume bastante cuota diaria de Firestore (50 000 lecturas). ¿Continuar?`)) return;
    ocupado.current = true;
    setError(null);
    setSubidas(0);
    setFase("subiendo");
    try {
      const r = await fetch("/api/procesos", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ carpeta: carpeta || "carpeta" }),
      });
      if (!r.ok) throw new Error("No se pudo crear el proceso");
      const { id } = (await r.json()) as { id: string };

      // Subida directa a Blob con concurrencia limitada: cada "worker" toma el siguiente archivo pendiente.
      let siguiente = 0;
      const worker = async () => {
        while (siguiente < seleccion.length) {
          const i = siguiente++;
          const archivo = seleccion[i];
          await conReintentos(() =>
            upload(pathnameDeSubida(id, i + 1, archivo.name), archivo, {
              access: "private", handleUploadUrl: "/api/blob/subir", contentType: archivo.type || undefined,
            }),
          );
          setSubidas((s) => s + 1);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_SUBIDA, seleccion.length) }, worker));

      setFase("iniciando");
      const ini = await fetch(`/api/procesos/${id}/iniciar`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limite: seleccion.length }),
      });
      if (!ini.ok) throw new Error(((await ini.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo iniciar");
      router.push(`/procesos/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setFase("espera");
      ocupado.current = false;
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-zinc-300 p-5 dark:border-zinc-700">
      <h2 className="text-lg font-semibold">Nuevo proceso</h2>
      <label className="flex flex-col gap-1 text-sm">
        Carpeta con las imágenes de facturas (.png / .jpg)
        <input
          type="file"
          multiple
          // @ts-expect-error webkitdirectory no está en los tipos de React pero lo soportan los navegadores
          webkitdirectory=""
          disabled={fase !== "espera"}
          onChange={(e) => elegir(e.target.files)}
        />
      </label>
      {imagenes.length > 0 && (
        <p className="text-sm">
          <b>{imagenes.length}</b> imágenes encontradas en «{carpeta}» ({mb(imagenes.reduce((a, f) => a + f.size, 0))} MB).
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        Procesar solo las primeras
        <input
          type="number" min={1} value={limite} onChange={(e) => setLimite(e.target.value)} disabled={fase !== "espera"}
          className="w-24 rounded border border-zinc-400 bg-transparent px-2 py-1"
        />
        <span className="opacity-60">(vacío = todas)</span>
      </label>
      {Number(limite) > LIMITE_AVISO || (limite === "" && imagenes.length > LIMITE_AVISO) ? (
        <p className="text-sm text-amber-600">
          Más de {LIMITE_AVISO} facturas gasta mucha cuota gratuita de Firestore (50 000 lecturas al día).
        </p>
      ) : null}
      <button
        onClick={procesar}
        disabled={fase !== "espera" || seleccion.length === 0}
        className="self-start rounded bg-foreground px-4 py-2 text-background disabled:opacity-40"
      >
        {fase === "espera" ? `Procesar ${seleccion.length || ""} facturas` : fase === "subiendo" ? "Subiendo…" : "Iniciando…"}
      </button>
      {fase === "subiendo" && (
        <div>
          <progress className="w-full" value={subidas} max={seleccion.length} />
          <p className="text-sm">Subidas {subidas} de {seleccion.length} ({mb(tamano)} MB)</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
