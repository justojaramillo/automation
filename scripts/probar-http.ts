// Recorrido completo por HTTP, igual que la interfaz: login → crear proceso → subida directa a Blob
// (token de /api/blob/subir) → iniciar → lotes concurrentes → finalizar → facturas → Excel. Luego LIMPIA.
//   CORREO=.. CLAVE=.. npx tsx scripts/probar-http.ts <urlBase> <carpetaImagenes> [cantidad] [--conservar]
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { del, list } from "@vercel/blob";
import { upload } from "@vercel/blob/client";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }
import { firestore } from "../src/lib/firebase/admin";
import { COLECCIONES, type Factura } from "../src/lib/modelo/tipos";
import { pathnameDeSubida } from "../src/lib/rutas";
import { refProceso } from "../src/lib/procesamiento/proceso";

async function main(): Promise<void> {
  const [base, carpeta, cantidadArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const conservar = process.argv.includes("--conservar");
  const archivos = readdirSync(carpeta).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().slice(0, cantidadArg ? Number(cantidadArg) : undefined);

  // 1. Login: ID token de Firebase (REST) → cookie de sesión del servidor.
  const r1 = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.CORREO, password: process.env.CLAVE, returnSecureToken: true }),
  });
  if (!r1.ok) throw new Error(`Login en Firebase falló: ${r1.status}`);
  const { idToken } = (await r1.json()) as { idToken: string };
  const r2 = await fetch(`${base}/api/sesion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
  console.log(`POST /api/sesion → ${r2.status}`);
  if (!r2.ok) throw new Error(`Sesión rechazada: ${await r2.text()}`);
  const cookie = (r2.headers.get("set-cookie") ?? "").split(";")[0];
  const h = { cookie };
  const j = async (ruta: string, init?: RequestInit) => fetch(`${base}${ruta}`, { ...init, headers: { ...h, ...(init?.headers ?? {}) } });

  console.log("GET /api/sesion →", (await (await j("/api/sesion")).json()));
  const { id } = (await (await j("/api/procesos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ carpeta: "prueba-http" }) })).json()) as { id: string };
  console.log("proceso", id);
  try {
    // 2. Subida directa a Blob con token emitido por nuestro servidor.
    const t0 = Date.now();
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < archivos.length) {
        const k = i++;
        await upload(pathnameDeSubida(id, k + 1, archivos[k]), readFileSync(path.join(carpeta, archivos[k])), {
          access: "private", handleUploadUrl: `${base}/api/blob/subir`, headers: h,
          contentType: archivos[k].endsWith(".png") ? "image/png" : "image/jpeg",
        });
      }
    }));
    console.log(`${archivos.length} imágenes subidas por client upload en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    // Seguridad: ruta fuera del proceso y tipo no permitido deben rechazarse.
    for (const mala of [`procesos/otro/0001-x.png`, `procesos/${id}/script.html`]) {
      try { await upload(mala, "x", { access: "private", handleUploadUrl: `${base}/api/blob/subir`, headers: h }); console.log("¡SE ACEPTÓ", mala, "!"); }
      catch { console.log(`rechazada correctamente: ${mala}`); }
    }

    // 3. Iniciar y bucle de lotes concurrentes (como VistaProceso).
    const ini = await j(`/api/procesos/${id}/iniciar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limite: archivos.length }) });
    console.log("iniciar →", ini.status, await ini.json());
    const t1 = Date.now();
    const tiempos: number[] = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (;;) {
        const t = Date.now();
        const r = await j(`/api/procesos/${id}/lote`, { method: "POST" });
        if (!r.ok) throw new Error(`lote ${r.status}: ${await r.text()}`);
        const d = (await r.json()) as { reclamados: number; detalle: { ms: number }[] };
        if (d.reclamados === 0) return;
        tiempos.push(...d.detalle.map((x) => x.ms));
        console.log(`  lote: ${d.reclamados} archivos en ${((Date.now() - t) / 1000).toFixed(1)} s`);
      }
    }));
    const seg = (Date.now() - t1) / 1000;
    console.log(`procesado en ${seg.toFixed(1)} s (${(seg / archivos.length).toFixed(1)} s/factura efectivo); por archivo: media ${(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000).toFixed(1)} s, máx ${(Math.max(...tiempos) / 1000).toFixed(1)} s`);

    const fin = await (await j(`/api/procesos/${id}/finalizar`, { method: "POST" })).json();
    console.log("finalizar →", fin);
    const estado = (await (await j(`/api/procesos/${id}`)).json()) as { estado: string; avance: Record<string, number> };
    console.log("estado:", estado.estado, JSON.stringify(estado.avance));
    const { facturas } = (await (await j(`/api/procesos/${id}/facturas`)).json()) as { facturas: { hash: string; estado: string }[] };
    console.log(`facturas: ${facturas.length} (${facturas.filter((f) => f.estado === "aceptada").length} aceptadas)`);

    // 4. Descarga del Excel e imagen original servida por nuestra ruta.
    const rx = await j(`/api/procesos/${id}/excel`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await rx.arrayBuffer()) as unknown as ExcelJS.Buffer);
    console.log(`GET excel → ${rx.status}, hojas: ${wb.worksheets.map((w) => `${w.name}(${w.rowCount - 1})`).join(", ")}`);
    const ri = await j(`/api/facturas/${facturas[0].hash}/imagen`);
    console.log(`GET imagen → ${ri.status} ${ri.headers.get("content-type")} ${(await ri.arrayBuffer()).byteLength} bytes`);
    // Aislamiento: sin cookie no se ve nada.
    console.log("sin cookie /api/procesos →", (await fetch(`${base}/api/procesos`)).status, "| imagen →", (await fetch(`${base}/api/facturas/${facturas[0].hash}/imagen`)).status);
  } finally {
    if (conservar) { console.log("--conservar: proceso", id); }
    else {
      const db = firestore();
      for (const d of (await db.collection(COLECCIONES.facturas).where("procesoId", "==", id).get()).docs) {
        const f = d.data() as Factura;
        if (f.numero) await db.collection(COLECCIONES.indicesNumero).doc(f.numero).delete();
        if (f.clienteDocumento) await db.collection(COLECCIONES.clientes).doc(f.clienteDocumento).delete();
        await d.ref.delete();
      }
      await db.recursiveDelete(refProceso(id));
      for (let c: string | undefined; ;) {
        const p = await list({ prefix: `procesos/${id}/`, cursor: c });
        if (p.blobs.length) await del(p.blobs.map((b) => b.pathname));
        if (!p.hasMore) break; c = p.cursor;
      }
      console.log("Datos de prueba eliminados.");
    }
  }
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
