"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Motor } from "./Motor";
import { botonSecundario } from "./ui";

const ENLACES = [
  { href: "/", texto: "Procesar facturas", activo: (p: string) => p === "/" || p.startsWith("/procesos") },
  { href: "/metricas", texto: "Métricas", activo: (p: string) => p.startsWith("/metricas") },
];

export function MenuSuperior() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sesion")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { email?: string } | null) => setEmail(d?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  async function salir() {
    await fetch("/api/sesion", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-borde bg-superficie/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="font-semibold tracking-tight">Procesador de facturas</span>
        <nav className="flex gap-1" aria-label="Principal">
          {ENLACES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              aria-current={e.activo(pathname) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${e.activo(pathname) ? "bg-acento text-acento-texto" : "hover:bg-pista"}`}
            >
              {e.texto}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Motor />
          <span className="hidden text-sm text-texto2 sm:inline">{email ?? ""}</span>
          <button onClick={salir} className={botonSecundario}>Cerrar sesión</button>
        </div>
      </div>
    </header>
  );
}
