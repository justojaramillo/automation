// Sesión en el servidor: el navegador inicia sesión con Firebase Auth, envía el ID token a
// POST /api/sesion y el servidor lo cambia por una COOKIE DE SESIÓN httpOnly (createSessionCookie).
// En cada Route Handler, `exigirUsuario` verifica esa cookie (incluida la revocación).

import type { NextRequest } from "next/server";
import { autenticacion } from "@/lib/firebase/admin";

export const NOMBRE_COOKIE = "sesion";
export const DURACION_SESION_MS = 5 * 24 * 60 * 60 * 1000; // 5 días (Firebase permite 5 min – 14 días)

export interface Usuario {
  uid: string;
  email: string;
}

/** Correos autorizados (USUARIOS_PERMITIDOS, separados por comas). Sin la variable: nadie entra. */
export function correoPermitido(email: string | undefined): boolean {
  const lista = (process.env.USUARIOS_PERMITIDOS ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && lista.includes(email!.toLowerCase());
}

export function respuesta401(): Response {
  return Response.json({ error: "No autenticado" }, { status: 401 });
}

/** Devuelve el usuario de la sesión o `null`. */
export async function usuarioDeSesion(request: NextRequest): Promise<Usuario | null> {
  const cookie = request.cookies.get(NOMBRE_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decodificado = await autenticacion().verifySessionCookie(cookie, true);
    if (!correoPermitido(decodificado.email)) return null;
    return { uid: decodificado.uid, email: decodificado.email! };
  } catch {
    return null;
  }
}

/**
 * Uso en un Route Handler:
 *   const u = await exigirUsuario(request);
 *   if (u instanceof Response) return u;   // 401
 */
export async function exigirUsuario(request: NextRequest): Promise<Usuario | Response> {
  return (await usuarioDeSesion(request)) ?? respuesta401();
}
