"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function BarraUsuario() {
  const router = useRouter();
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
    <div className="flex items-center justify-end gap-3 px-6 py-3 text-sm">
      <span className="opacity-70">{email ?? "…"}</span>
      <button onClick={salir} className="rounded border border-zinc-400 px-3 py-1">
        Cerrar sesión
      </button>
    </div>
  );
}
