// Fase 0: comprueba Firestore, Firebase Authentication y Vercel Blob con las variables de .env.
//   npx tsx scripts/probar-conexion.ts
// No imprime secretos: solo "OK" o el mensaje de error de cada servicio.

import { list } from "@vercel/blob";
import { autenticacion, firestore } from "../src/lib/firebase/admin";

try {
  process.loadEnvFile(".env"); // Node ≥ 20.12; si no existe, se usan las variables del entorno
} catch {
  /* sin .env: seguimos con process.env */
}

async function probar(nombre: string, accion: () => Promise<string>): Promise<boolean> {
  try {
    console.log(`${nombre} OK — ${await accion()}`);
    return true;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`${nombre} FALLÓ — ${mensaje}`);
    return false;
  }
}

async function main(): Promise<void> {
  const resultados = [
    await probar("Firestore", async () => {
      // Escribe, lee y borra un documento temporal: prueba permisos de escritura y lectura.
      const ref = firestore().collection("_pruebas").doc("conexion");
      await ref.set({ momento: new Date().toISOString() });
      const leido = await ref.get();
      await ref.delete();
      if (!leido.exists) throw new Error("el documento escrito no se pudo leer");
      return "escritura, lectura y borrado correctos";
    }),
    await probar("Auth", async () => {
      const { users } = await autenticacion().listUsers(10);
      return `${users.length} usuario(s) registrado(s)`;
    }),
    await probar("Blob", async () => {
      const { blobs } = await list({ limit: 5 });
      return `${blobs.length} archivo(s) en el almacén`;
    }),
  ];

  process.exit(resultados.every(Boolean) ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
