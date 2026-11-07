// Firebase en el NAVEGADOR: solo Authentication. Las variables NEXT_PUBLIC_* son públicas por
// diseño (la seguridad real está en las reglas de Firestore, cerradas, y en la verificación del
// servidor). Next solo las inyecta si se escriben literalmente como process.env.NEXT_PUBLIC_X.

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export function authCliente(): Auth {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  return getAuth(app);
}
