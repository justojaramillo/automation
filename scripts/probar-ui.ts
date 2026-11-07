// Prueba de la INTERFAZ con un navegador real (Playwright): login → elegir carpeta → dividir en lotes → subir
// y procesar → métricas → borrar todo. Guarda capturas para revisarlas a ojo.
//   CORREO=.. CLAVE=.. npx tsx scripts/probar-ui.ts <urlBase> <carpetaImagenes> <facturasPorLote> <carpetaCapturas> [--conservar]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

import { limpiarLotes } from "./limpiar-lotes";

async function main(): Promise<void> {
  const [base, carpeta, tamLote, capturas] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const conservar = process.argv.includes("--conservar");
  mkdirSync(capturas, { recursive: true });
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 900 } });
  const errores: string[] = [];
  pagina.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  pagina.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
  const foto = (n: string) => pagina.screenshot({ path: `${capturas}/${n}.png`, fullPage: true });

  await pagina.goto(`${base}/login`);
  await pagina.fill("input[type=email]", process.env.CORREO!);
  await pagina.fill("input[type=password]", process.env.CLAVE!);
  await pagina.click("button[type=submit]");
  await pagina.waitForURL(`${base}/`, { timeout: 30000 });
  await pagina.waitForSelector("text=Elegir carpeta");
  await foto("01-inicio");
  const previos = new Set((await pagina.evaluate(async () => (await fetch("/api/metricas")).json() as Promise<{ lotes: { id: string }[] }>)).lotes.map((l) => l.id));

  // 1. Elegir carpeta (input de directorio) y dividir en lotes
  await pagina.setInputFiles('[data-testid="carpeta"]', carpeta);
  await pagina.fill('input[type=number]', tamLote);
  await pagina.waitForSelector("text=imágenes en");
  console.log("selección:", (await pagina.locator("text=imágenes en").first().innerText()).replace(/\s+/g, " "));
  console.log("plan:", (await pagina.locator("text=→").first().innerText()).replace(/\s+/g, " "));
  await foto("02-seleccion");

  // 2. Subir y procesar
  const sinProcesar = process.argv.includes("--sin-procesar");
  const nImagenes = Number((await pagina.locator("text=imágenes en").first().innerText()).match(/(\d[\d.]*)/)?.[1].replace(/\./g, ""));
  const esperados = Math.ceil(nImagenes / Number(tamLote));
  if (sinProcesar) await pagina.route("**/api/procesos/*/lote", (r) => r.abort()); // no se hace OCR: solo subida y cola
  // Medidor de bloqueo: retraso máximo del bucle de eventos del navegador mientras sube
  await pagina.evaluate(() => {
    const w = window as unknown as { __lagMax: number };
    w.__lagMax = 0;
    let previo = performance.now();
    setInterval(() => { const ahora = performance.now(); w.__lagMax = Math.max(w.__lagMax, ahora - previo - 100); previo = ahora; }, 100);
  });
  const t0 = Date.now();
  await pagina.click('[data-testid="procesar"]');
  await pagina.waitForSelector("text=Avance de los lotes");
  await pagina.waitForTimeout(6000);
  await foto("03-subiendo-en-vivo");
  const enVivo = await pagina.locator("section[aria-label*='Procesado']").first().innerText().catch(() => "(sin panel en vivo todavía)");
  console.log("en vivo:", enVivo.replace(/\s+/g, " ").slice(0, 300));

  if (sinProcesar) {
    for (;;) {
      const r = await pagina.evaluate(async () => (await fetch("/api/metricas")).json() as Promise<{ lotes: { totalArchivos: number }[] }>);
      const nuevos = r.lotes.filter((l) => l.totalArchivos > 0);
      if (nuevos.length >= esperados + 0 && nuevos.reduce((a, l) => a + l.totalArchivos, 0) >= nImagenes) { console.log(`subida de ${nImagenes} imágenes en ${nuevos.length} lotes lista en ${((Date.now() - t0) / 1000).toFixed(0)} s (cola creada)`); break; }
      if (Date.now() - t0 > 20 * 60_000) throw new Error("Tiempo agotado esperando la subida");
      await pagina.waitForTimeout(2000);
    }
    const lag = await pagina.evaluate(() => (window as unknown as { __lagMax: number }).__lagMax);
    console.log(`retraso máximo del navegador durante la subida: ${Math.round(lag)} ms (menos de ~200 ms = no se bloquea)`);
    await foto("03b-subida-masiva");
  }
  // Esperar a que todos los lotes terminen (el motor del layout los procesa en segundo plano)
  const fin = Date.now() + 25 * 60_000;
  while (!sinProcesar) {
    const r = await pagina.evaluate(async () => (await fetch("/api/metricas")).json() as Promise<{ lotes: { estado: string; totalArchivos: number }[] }>);
    const todos = r.lotes.length > 0 && r.lotes.every((l) => l.estado === "terminado");
    if (todos) { console.log(`${r.lotes.length} lotes terminados en ${((Date.now() - t0) / 1000).toFixed(0)} s`); break; }
    if (Date.now() > fin) throw new Error("Tiempo agotado esperando los lotes");
    await pagina.waitForTimeout(3000);
  }
  await pagina.waitForTimeout(1500);
  await foto("04-lotes-terminados");

  // 3. Métricas
  if (!sinProcesar) {
  await pagina.click("nav >> text=Métricas");
  await pagina.waitForURL(`${base}/metricas`);
  await pagina.waitForSelector("text=Calidad de la lectura");
  await pagina.waitForTimeout(800);
  await foto("05-metricas-todos");
  const textoTodos = await pagina.locator("main", { hasText: "Calidad de la lectura" }).innerText();
  console.log("métricas (todos):", textoTodos.replace(/\s+/g, " ").slice(0, 700));
  const lotes = await pagina.evaluate(async () => (await fetch("/api/metricas")).json() as Promise<{ lotes: { numero: number; totalArchivos: number; metricas: { aceptadas?: { n: number; total: number }; revision?: { n: number }; errores?: number; duplicadas?: number } }[] }>);
  for (const l of lotes.lotes) console.log(`  lote ${l.numero}: ${l.totalArchivos} archivos | aceptadas ${l.metricas.aceptadas?.n ?? 0} (total ${l.metricas.aceptadas?.total ?? 0}) revisión ${l.metricas.revision?.n ?? 0} errores ${l.metricas.errores ?? 0} duplicadas ${l.metricas.duplicadas ?? 0}`);
  await pagina.selectOption('[data-testid="selector-lote"]', { index: 1 });
  await pagina.waitForTimeout(500);
  await foto("06-metricas-lote1");

  // 4. Detalle de un lote
  await pagina.click('[data-testid="tabla-lotes"] >> text=Detalle >> nth=0');
  await pagina.waitForSelector("text=Facturas (", { timeout: 30000 });
  await pagina.waitForTimeout(800);
  await foto("07-detalle-lote");

  }
  // 5. Botón "Borrar todo": por defecto solo se comprueba el diálogo (NO se confirma: es un borrado total de la
  //    base de datos y del Blob). Con --borrar-todo se confirma de verdad.
  await pagina.click("nav >> text=Procesar facturas");
  await pagina.waitForSelector('[data-testid="borrar-abrir"]');
  await pagina.click('[data-testid="borrar-abrir"]');
  const desactivado = await pagina.locator('[data-testid="borrar-confirmar"]').isDisabled();
  await pagina.fill('[data-testid="borrar-texto"]', "borrar"); // minúsculas: no vale
  const sigueDesactivado = await pagina.locator('[data-testid="borrar-confirmar"]').isDisabled();
  await pagina.fill('[data-testid="borrar-texto"]', "BORRAR");
  const activado = !(await pagina.locator('[data-testid="borrar-confirmar"]').isDisabled());
  console.log(`diálogo de borrado: desactivado al inicio=${desactivado}, con "borrar"=${sigueDesactivado}, con "BORRAR" activado=${activado}`);
  await foto("08-confirmar-borrado");
  if (process.argv.includes("--borrar-todo")) {
    await pagina.click('[data-testid="borrar-confirmar"]');
    await pagina.waitForSelector("text=Listo: se borraron", { timeout: 120000 });
    console.log("borrado:", (await pagina.locator("[role=status]").first().innerText()).replace(/\s+/g, " "));
    await foto("09-borrado");
  }
  // Limpieza ACOTADA: solo los lotes que creó esta prueba.
  if (!conservar && !process.argv.includes("--borrar-todo")) {
    const creados = (await pagina.evaluate(async () => (await fetch("/api/metricas")).json() as Promise<{ lotes: { id: string }[] }>)).lotes.map((l) => l.id).filter((id) => !previos.has(id));
    await limpiarLotes(creados);
    console.log(`limpieza acotada: ${creados.length} lotes de esta prueba eliminados`);
  }
  console.log("errores de consola/página:", errores.length ? errores : "ninguno");
  await navegador.close();
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
