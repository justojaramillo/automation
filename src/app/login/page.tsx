"use client";

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authCliente } from "@/lib/firebase/cliente";

export default function Login() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const auth = authCliente();
      const credencial = await signInWithEmailAndPassword(auth, correo, clave);
      const idToken = await credencial.user.getIdToken();
      const r = await fetch("/api/sesion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      // La sesión real vive en la cookie del servidor; la de Firebase en el navegador sobra.
      await signOut(auth);
      if (!r.ok) {
        const datos = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(datos.error ?? "No se pudo iniciar sesión");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith("Firebase") ? "Correo o contraseña incorrectos" : (err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <form onSubmit={entrar} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Correo"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="rounded border border-zinc-400 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="rounded border border-zinc-400 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          disabled={cargando}
          className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
