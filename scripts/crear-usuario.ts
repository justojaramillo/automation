// Crea (o actualiza la contraseña de) un usuario de Firebase Authentication con el Admin SDK.
// El correo y la contraseña llegan por variables de entorno, nunca quedan en el código:
//   CORREO=a@b.com CLAVE=secreta npx tsx scripts/crear-usuario.ts
import { autenticacion } from "../src/lib/firebase/admin";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

async function main(): Promise<void> {
  const email = process.env.CORREO;
  const password = process.env.CLAVE;
  if (!email || !password) throw new Error("Define CORREO y CLAVE");
  const auth = autenticacion();
  try {
    const existente = await auth.getUserByEmail(email);
    await auth.updateUser(existente.uid, { password });
    console.log(`Usuario ya existía (${email}): contraseña actualizada.`);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    const u = await auth.createUser({ email, password, emailVerified: true });
    console.log(`Usuario creado: ${u.email} (uid ${u.uid})`);
  }
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
