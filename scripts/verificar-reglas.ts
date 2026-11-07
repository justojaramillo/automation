// Fase 2: comprueba que las reglas de Firestore están cerradas. Una petición REST ANÓNIMA
// (solo con la apiKey pública) debe ser rechazada con 403.
//   npx tsx scripts/verificar-reglas.ts

export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* sin .env */
}

const proyecto = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!proyecto || !apiKey) {
  console.error("Faltan NEXT_PUBLIC_FIREBASE_PROJECT_ID o NEXT_PUBLIC_FIREBASE_API_KEY");
  process.exit(1);
}

async function main(): Promise<void> {
  let fallos = 0;
  for (const coleccion of ["clientes", "facturas", "procesos"]) {
    const base = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/${coleccion}`;
    const lectura = await fetch(`${base}?key=${apiKey}&pageSize=1`);
    const escritura = await fetch(`${base}/prueba?key=${apiKey}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { x: { stringValue: "y" } } }),
    });
    const bien = lectura.status === 403 && escritura.status === 403;
    if (!bien) fallos++;
    console.log(`${bien ? "OK " : "MAL"} ${coleccion}: lectura anónima ${lectura.status}, escritura anónima ${escritura.status} (se espera 403)`);
  }
  console.log(fallos === 0 ? "Reglas cerradas: OK" : "¡Reglas abiertas! Revisa Firestore → Reglas");
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
