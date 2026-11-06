// Firebase Admin SDK: SOLO servidor. Usa la cuenta de servicio, que se salta las reglas
// de seguridad de Firestore, así que este módulo jamás debe importarse desde un componente
// de cliente. Las variables salen de .env (local) o de las variables de entorno de Vercel.

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} (revisa .env / Vercel).`);
  return valor;
}

/** Inicializa la app una sola vez (el registro de apps de firebase-admin hace de singleton, también con HMR). */
export function appAdmin(): App {
  const existente = getApps()[0];
  if (existente) return existente;
  return initializeApp({
    credential: cert({
      projectId: variable("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: variable("FIREBASE_ADMIN_CLIENT_EMAIL"),
      // En .env y en Vercel la clave se guarda con "\n" escritos; aquí se convierten en saltos reales.
      privateKey: variable("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

export function firestore(): Firestore {
  return getFirestore(appAdmin());
}

export function autenticacion(): Auth {
  return getAuth(appAdmin());
}
