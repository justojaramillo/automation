// Recorrido completo por HTTP, igual que la interfaz: login → crear proceso → subida de cada imagen A TRAVÉS
// de la API (/api/procesos/<id>/imagenes, que valida y guarda en Blob) → iniciar → lotes concurrentes → finalizar → facturas → Excel. Luego LIMPIA.
//   CORREO=.. CLAVE=.. npx tsx scripts/probar-http.ts <urlBase> <carpetaImagenes> [cantidad] [--conservar]
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }
import { limpiarLotes } from "./limpiar-lotes";

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
    // 2. Subida a través de nuestra API: una imagen por petición, con 6 en paralelo (como la interfaz).
    const urlImagen = (k: number, nombre: string, lote = id) => `${base}/api/procesos/${lote}/imagenes?indice=${k}&nombre=${encodeURIComponent(nombre)}`;
    const t0 = Date.now();
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < archivos.length) {
        const k = i++;
        const r = await fetch(urlImagen(k + 1, archivos[k]), {
          method: "POST", headers: { ...h, "content-type": archivos[k].endsWith(".png") ? "image/png" : "image/jpeg" },
          body: readFileSync(path.join(carpeta, archivos[k])),
        });
        if (!r.ok) throw new Error(`subida de ${archivos[k]}: ${r.status} ${await r.text()}`);
      }
    }));
    console.log(`${archivos.length} imágenes subidas por la API en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    // Seguridad: el servidor debe rechazar lo que no sea una imagen válida del lote del usuario.
    const png = readFileSync(path.join(carpeta, archivos.find((a) => a.endsWith(".png")) ?? archivos[0]));
    const casos: [string, number, () => Promise<Response>][] = [
      ["sin sesión", 401, () => fetch(urlImagen(1, "x.png"), { method: "POST", headers: { "content-type": "image/png" }, body: png })],
      ["texto disfrazado de .png", 415, () => fetch(urlImagen(901, "falsa.png"), { method: "POST", headers: { ...h, "content-type": "image/png" }, body: "<script>alert(1)</script>".repeat(10) })],
      ["firma PNG pero archivo dañado", 415, () => fetch(urlImagen(902, "rota.png"), { method: "POST", headers: { ...h, "content-type": "image/png" }, body: Buffer.concat([png.subarray(0, 8), Buffer.alloc(300, 7)]) })],
      ["más de 4 MB", 413, () => fetch(urlImagen(903, "enorme.png"), { method: "POST", headers: { ...h, "content-type": "image/png" }, body: Buffer.concat([png.subarray(0, 8), Buffer.alloc(4_200_000)]) })],
      ["lote que no existe", 404, () => fetch(urlImagen(904, "x.png", "AAAAAAAAAAAAAAAAAAAA"), { method: "POST", headers: { ...h, "content-type": "image/png" }, body: png })],
      ["índice inválido", 400, () => fetch(`${base}/api/procesos/${id}/imagenes?indice=0&nombre=x.png`, { method: "POST", headers: { ...h, "content-type": "image/png" }, body: png })],
    ];
    for (const [titulo, esperado, peticion] of casos) {
      const r = await peticion();
      console.log(`  rechazo «${titulo}»: ${r.status} ${r.status === esperado ? "✓" : `✗ (se esperaba ${esperado})`}`);
      if (r.status !== esperado) throw new Error(`El servidor respondió ${r.status} en «${titulo}»`);
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
        const d = (await r.json()) as { reclamados: number; detalle: { ms: number; resultado: string }[] };
        for (const x of d.detalle) if (x.resultado.startsWith("error")) console.log("    ", x.resultado.slice(0, 400));
        if (d.reclamados === 0) return;
        tiempos.push(...d.detalle.map((x) => x.ms));
        console.log(`  lote: ${d.reclamados} archivos en ${((Date.now() - t) / 1000).toFixed(1)} s`);
      }
    }));
    const seg = (Date.now() - t1) / 1000;
    console.log(`procesado en ${seg.toFixed(1)} s (${(seg / archivos.length).toFixed(1)} s/factura efectivo); por archivo: media ${(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000).toFixed(1)} s, máx ${(Math.max(...tiempos) / 1000).toFixed(1)} s`);

    const fin = await (await j(`/api/procesos/${id}/finalizar`, { method: "POST" })).json();
    console.log("finalizar →", fin);
    const estado = (await (await j(`/api/procesos/${id}`)).json()) as { estado: string; metricas: Record<string, unknown> };
    console.log("estado:", estado.estado, JSON.stringify(estado.metricas));
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
      await limpiarLotes([id]); // limpiador seguro: solo lo que pertenece a este lote
      console.log("Datos de prueba eliminados.");
    }
  }
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
