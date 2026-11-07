"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Item {
  id: string;
  carpeta: string;
  estado: string;
  totalArchivos: number;
  inicio: number;
}

export function ListaProcesos() {
  const [procesos, setProcesos] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch("/api/procesos")
      .then((r) => (r.ok ? r.json() : { procesos: [] }))
      .then((d: { procesos: Item[] }) => setProcesos(d.procesos))
      .catch(() => setProcesos([]));
  }, []);
  if (!procesos?.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Procesos anteriores</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {procesos.map((p) => (
          <li key={p.id}>
            <Link className="underline" href={`/procesos/${p.id}`}>
              {new Date(p.inicio).toLocaleString("es-CO")} — {p.carpeta}
            </Link>{" "}
            <span className="opacity-60">({p.totalArchivos} archivos, {p.estado})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
