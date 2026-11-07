// Prueba de la REVISIÓN MANUAL con navegador real (Playwright) y datos reales: prepara dos facturas que la
// máquina no pudo aceptar (una con error del OCR, otra en revisión con datos parciales) con su imagen en
// Blob, y una persona las completa desde la interfaz. Comprueba lista, formulario, validación en vivo,
// guardado, métricas, detalle del lote y Excel regenerado. Limpia SOLO el lote que creó.
//   CORREO=.. CLAVE=.. npx tsx scripts/probar-revision-ui.ts <urlBase> <carpetaImagenes> <verdad.json> <carpetaCapturas>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { Timestamp } from "firebase-admin/firestore";
import { chromium } from "playwright";

try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

import { autenticacion, firestore } from "../src/lib/firebase/admin";
import { COLECCIONES, TERMINADO, type ArchivoCola, type Proceso } from "../src/lib/modelo/tipos";
import { colaArchivos } from "../src/lib/procesamiento/cola";
import { regenerarExcel } from "../src/lib/procesamiento/finalizar";
import { guardarFactura, guardarFallo } from "../src/lib/procesamiento/guardar";
import { refProceso } from "../src/lib/procesamiento/proceso";
import type { ParcialFactura } from "../src/lib/ocr/tipos";
import { limpiarLotes } from "./limpiar-lotes";

type V = { archivo: string; numero: string; fecha: string; proveedor: { nombre: string; nit: string; dv: number }; cliente: { documento: string; dv: number; nombre: string };
  items: { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }[]; subtotal: number; iva: number; impoconsumo: number; total: number;
  problema?: string | null };

let fallos = 0;
const ok = (titulo: string, cond: boolean, detalle = "") => { console.log(`  ${cond ? "✓" : "✗"} ${titulo}${cond || !detalle ? "" : ` — ${detalle}`}`); if (!cond) fallos++; };

async function main(): Promise<void> {
  const [base, carpeta, verdadPath, capturas] = process.argv.slice(2);
  mkdirSync(capturas, { recursive: true });
  const verdad = (JSON.parse(readFileSync(verdadPath, "utf8")) as { facturas: V[] }).facturas;
  // Se eligen facturas con impoconsumo (A) y sin él (B) para recorrer ambos caminos del formulario.
  // Se evitan las facturas con problema deliberado: sus cifras IMPRESAS no cuadran a propósito.
  const sanas = verdad.filter((f) => !f.problema);
  const vA = sanas.find((f) => f.impoconsumo > 0)!;
  const vB = sanas.find((f) => f.impoconsumo === 0 && f.archivo !== vA.archivo)!;
  const db = firestore();
  const uid = (await autenticacion().getUserByEmail(process.env.CORREO!)).uid;
  const proceso: Proceso = { uid, carpeta: "prueba-revision", estado: "terminado", totalArchivos: 2, inicio: Timestamp.now(), fin: Timestamp.now(), rutaExcel: null };
  const procesoId = (await db.collection(COLECCIONES.procesos).add(proceso)).id;
  const navegador = await chromium.launch();
  try {
    // ── Preparación: dos facturas que la máquina no pudo aceptar, con su imagen real en Blob ──
    const preparar = async (v: V, n: number) => {
      const bytes = readFileSync(path.join(carpeta, v.archivo));
      const pathname = `procesos/${procesoId}/${String(n).padStart(4, "0")}-${v.archivo}`;
      await put(pathname, bytes, { access: "private", contentType: v.archivo.endsWith(".png") ? "image/png" : "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
      const cola: ArchivoCola = { blobPathname: pathname, nombre: v.archivo, estado: "procesando", resultado: null, clienteNuevo: false, intentos: 1, error: null, disponibleDesde: TERMINADO };
      await colaArchivos(procesoId).doc(path.basename(pathname)).set(cola);
      return { hash: createHash("sha256").update(bytes).digest("hex"), pathname, id: path.basename(pathname) };
    };
    const a = await preparar(vA, 1);
    const b = await preparar(vB, 2);
    const hay = (await db.collection(COLECCIONES.facturas).doc(a.hash).get()).exists || (await db.collection(COLECCIONES.facturas).doc(b.hash).get()).exists;
    if (hay) throw new Error("Estas imágenes ya están en la base (mismo hash): borra esos datos o elige otro conjunto.");
    await guardarFallo({ procesoId, uid, archivoId: a.id, nombre: vA.archivo, blobPathname: a.pathname, hash: a.hash, error: "OCR sin texto" });
    const parcialB: ParcialFactura = {
      numero: vB.numero, fecha: vB.fecha, proveedor: vB.proveedor.nombre, nitProveedor: vB.proveedor.nit, dvProveedor: vB.proveedor.dv,
      clienteDocumento: null, clienteDv: null, clienteNombre: null, items: vB.items.map(({ descripcion, cantidad, precioUnitario, subtotal }) => ({ descripcion, cantidad, precioUnitario, subtotal })),
      subtotal: vB.subtotal, iva: vB.iva, impoconsumo: null, mencionaImpoconsumo: false, total: vB.total,
    };
    await guardarFactura({ procesoId, uid, archivoId: b.id, nombre: vB.archivo, blobPathname: b.pathname, hash: b.hash, parcial: parcialB, motivos: ["Falta el documento del cliente"], confianza: 71 });
    await regenerarExcel(procesoId); // Excel inicial, con las facturas todavía pendientes
    console.log(`Preparación: lote ${procesoId} con 2 facturas pendientes (${vA.archivo}: error del OCR; ${vB.archivo}: faltan los datos del cliente)`);

    // ── Navegador real ──
    const pagina = await navegador.newPage({ viewport: { width: 1360, height: 900 } });
    const errores: string[] = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    pagina.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(401|404)/.test(m.text())) errores.push(m.text()); });
    await pagina.goto(`${base}/login`);
    await pagina.fill("input[type=email]", process.env.CORREO!);
    await pagina.fill("input[type=password]", process.env.CLAVE!);
    await pagina.click("button[type=submit]");
    await pagina.waitForURL(`${base}/`, { timeout: 30000 });

    console.log("\n1. Lista de pendientes");
    await pagina.click("nav >> text=Revisión");
    await pagina.waitForSelector('[data-testid="tabla-revision"]:visible');
    const filas = await pagina.locator('[data-testid="tabla-revision"]:visible tbody tr').allInnerTexts();
    ok("aparecen las dos facturas del lote de prueba", filas.some((f) => f.includes(vA.archivo)) && filas.some((f) => f.includes(vB.archivo)), filas.join(" | ").slice(0, 200));
    ok("la fila muestra qué falló", filas.some((f) => /No se pudo procesar|Falta el documento del cliente/.test(f)));
    await pagina.screenshot({ path: path.join(capturas, "01-lista-revision.png"), fullPage: true });

    console.log("\n2. Formulario de la factura A (error del OCR: vacía)");
    await pagina.locator(`tr:has-text("${vA.archivo}") >> text=Revisar`).click();
    await pagina.waitForURL(new RegExp(`/revision/${a.hash}`));
    await pagina.waitForSelector('[data-testid="imagen"]:visible');
    await pagina.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="imagen"]')].some((i) => i.offsetParent !== null && i.naturalWidth > 0), null, { timeout: 20000 });
    ok("la imagen original se ve (servida desde el Blob privado)", true);
    // Girar la imagen (para las facturas fotografiadas de lado): el servidor la gira y las dimensiones se intercambian.
    const dimensiones = () => pagina.evaluate(() => { const i = [...document.querySelectorAll<HTMLImageElement>('[data-testid="imagen"]')].find((x) => x.offsetParent !== null)!; return [i.naturalWidth, i.naturalHeight]; });
    const [ancho0, alto0] = await dimensiones();
    await pagina.click('button[aria-label="Girar a la derecha"]:visible');
    await pagina.waitForFunction(([w, h]) => [...document.querySelectorAll<HTMLImageElement>('[data-testid="imagen"]')].some((i) => i.offsetParent !== null && i.naturalWidth === h && i.naturalHeight === w), [ancho0, alto0], { timeout: 20000 });
    ok(`«Girar a la derecha» gira la imagen (${ancho0}×${alto0} → ${alto0}×${ancho0})`, true);
    await pagina.click('button[aria-label="Girar a la izquierda"]:visible');
    await pagina.waitForFunction(([w, h]) => [...document.querySelectorAll<HTMLImageElement>('[data-testid="imagen"]')].some((i) => i.offsetParent !== null && i.naturalWidth === w && i.naturalHeight === h), [ancho0, alto0], { timeout: 20000 });
    ok("«Girar a la izquierda» la devuelve a su posición", true);
    const malo = await pagina.evaluate(async (h) => (await fetch(`/api/facturas/${h}/imagen?rotar=45`)).status, a.hash);
    ok("el servidor rechaza un giro que no sea 90, 180 o 270 (400)", malo === 400, String(malo));
    await pagina.screenshot({ path: path.join(capturas, "02a-formulario-vacio-ventana.png") }); // solo la ventana (la página completa distorsiona el encabezado fijo)
    ok("la validación avisa que faltan datos (botón desactivado)", await pagina.locator('[data-testid="guardar"]:visible').isDisabled());
    await pagina.fill('[data-testid="f-numero"]:visible', vA.numero);
    await pagina.fill('[data-testid="f-fecha"]:visible', vA.fecha);
    await pagina.fill('[data-testid="f-proveedor"]:visible', vA.proveedor.nombre);
    await pagina.fill('[data-testid="f-nit"]:visible', vA.proveedor.nit);
    await pagina.fill('[data-testid="f-dv-nit"]:visible', String(vA.proveedor.dv));
    await pagina.fill('[data-testid="f-doc-cliente"]:visible', vA.cliente.documento);
    await pagina.fill('[data-testid="f-dv-cliente"]:visible', String(vA.cliente.dv));
    await pagina.fill('[data-testid="f-nombre-cliente"]:visible', vA.cliente.nombre);
    for (let i = 0; i < vA.items.length; i++) {
      if (i > 0) await pagina.click('[data-testid="agregar-item"]:visible');
      await pagina.fill(`[data-testid="i-desc-${i}"]:visible`, vA.items[i].descripcion);
      await pagina.fill(`[data-testid="i-cant-${i}"]:visible`, String(vA.items[i].cantidad));
      await pagina.fill(`[data-testid="i-precio-${i}"]:visible`, String(vA.items[i].precioUnitario));
    }
    await pagina.check('[data-testid="f-aplica-inc"]:visible');
    const sugerido = await pagina.inputValue('[data-testid="f-total"]:visible');
    ok(`los totales se calculan solos desde los ítems (total ${sugerido})`, Number(sugerido) === vA.total, `esperado ${vA.total}`);
    ok("todas las validaciones pasan y se puede guardar sin confirmar", /Todas las validaciones pasan/.test(await pagina.locator('[data-testid="validacion"]:visible').innerText()) && !(await pagina.locator('[data-testid="guardar"]:visible').isDisabled()));
    await pagina.screenshot({ path: path.join(capturas, "02-formulario-completo.png"), fullPage: true });

    console.log("\n3. Validación en vivo: un total equivocado exige confirmar");
    await pagina.fill('[data-testid="f-total"]:visible', String(vA.total + 5000));
    const texto = await pagina.locator('[data-testid="validacion"]:visible').innerText();
    ok("muestra el motivo del total", /total/i.test(texto) && !/Todas las validaciones pasan/.test(texto));
    ok("el botón queda desactivado hasta confirmar", await pagina.locator('[data-testid="guardar"]:visible').isDisabled());
    await pagina.check('[data-testid="confirmo"]:visible');
    ok("al confirmar dice «Guardar de todos modos»", /todos modos/.test(await pagina.locator('[data-testid="guardar"]:visible').innerText()) && !(await pagina.locator('[data-testid="guardar"]:visible').isDisabled()));
    await pagina.screenshot({ path: path.join(capturas, "03-validacion-no-cuadra.png"), fullPage: true });
    await pagina.click('[data-testid="recalcular"]:visible');
    ok("«Recalcular» vuelve a los totales correctos", Number(await pagina.inputValue('[data-testid="f-total"]:visible')) === vA.total);

    console.log("\n4. Guardar A y pasar a la siguiente");
    await pagina.click('[data-testid="guardar"]:visible');
    await pagina.waitForSelector('[data-testid="mensaje"]:visible');
    ok("mensaje de éxito", /guardada/.test(await pagina.locator('[data-testid="mensaje"]:visible').innerText()));
    await pagina.waitForURL(new RegExp(`/revision/${b.hash}`), { timeout: 15000 });
    ok("avanza solo a la siguiente pendiente (B)", true);
    // Next 16 (cacheComponents) deja montada y OCULTA la pantalla anterior: por eso los selectores usan :visible.

    const fa = (await db.collection(COLECCIONES.facturas).doc(a.hash).get()).data()!;
    ok("en Firestore: aceptada, corregida a mano por el usuario, con sus datos", fa.estado === "aceptada" && fa.corregidaManualmente === true && fa.corregidaPor === process.env.CORREO && fa.total === vA.total && fa.numero === vA.numero);

    console.log("\n5. Factura B (en revisión): llegan precargados los datos que la máquina sí leyó");
    await pagina.waitForSelector('[data-testid="f-numero"]:visible');
    await pagina.waitForFunction((esperado) => [...document.querySelectorAll<HTMLInputElement>('[data-testid="f-numero"]')].some((i) => i.offsetParent !== null && i.value === esperado), vB.numero, { timeout: 20000 });
    ok("el formulario nuevo no arrastra la confirmación ni el mensaje de la factura anterior", !(await pagina.locator('[data-testid="mensaje"]:visible').count()) && !(await pagina.locator('[data-testid="confirmo"]:visible').count()));
    ok("número, proveedor e ítems precargados", (await pagina.inputValue('[data-testid="f-numero"]:visible')) === vB.numero && (await pagina.inputValue('[data-testid="f-proveedor"]:visible')) === vB.proveedor.nombre && (await pagina.inputValue('[data-testid="i-desc-0"]:visible')) === vB.items[0].descripcion);
    ok("la validación señala lo que falta (cliente)", /cliente/i.test(await pagina.locator('[data-testid="validacion"]:visible').innerText()));
    await pagina.fill('[data-testid="f-doc-cliente"]:visible', vB.cliente.documento);
    await pagina.fill('[data-testid="f-dv-cliente"]:visible', String(vB.cliente.dv));
    await pagina.fill('[data-testid="f-nombre-cliente"]:visible', vB.cliente.nombre);
    ok("con el cliente completo, todo pasa", /Todas las validaciones pasan/.test(await pagina.locator('[data-testid="validacion"]:visible').innerText()));
    await pagina.screenshot({ path: path.join(capturas, "04-formulario-precargado.png"), fullPage: true });
    await pagina.click('[data-testid="guardar"]:visible');
    await pagina.waitForURL(`${base}/revision`, { timeout: 15000 });
    await pagina.waitForSelector("text=No hay facturas pendientes");
    ok("la lista queda sin pendientes", true);
    await pagina.screenshot({ path: path.join(capturas, "05-sin-pendientes.png"), fullPage: true });

    console.log("\n6. Métricas y detalle del lote");
    await pagina.click("nav >> text=Métricas");
    await pagina.waitForSelector('[data-testid="aviso-pendientes"]:visible');
    const aviso = await pagina.locator('[data-testid="aviso-pendientes"]:visible').innerText();
    ok("el panel informa cuántas se revisaron a mano y cuántas esperan", /2 ya se revisaron a mano y 0 esperan/.test(aviso), aviso);
    await pagina.screenshot({ path: path.join(capturas, "06-metricas.png"), fullPage: true });
    await pagina.goto(`${base}/procesos/${procesoId}`);
    await pagina.waitForSelector("text=Facturas (");
    const detalle = await pagina.locator("main").innerText();
    ok("el detalle marca las facturas como «Revisada a mano»", (detalle.match(/Revisada a mano/g) ?? []).length >= 2, detalle.slice(0, 300));
    ok("ofrece regenerar el Excel", await pagina.locator('[data-testid="regenerar-excel"]:visible').isVisible());
    await pagina.screenshot({ path: path.join(capturas, "07-detalle-lote.png"), fullPage: true });
    const numerosDelExcel = async (): Promise<string[]> => {
      const bytes = await pagina.evaluate(async (id) => Array.from(new Uint8Array(await (await fetch(`/api/procesos/${id}/excel`)).arrayBuffer())), procesoId);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
      const numeros: string[] = [];
      libro.getWorksheet("Facturas")!.eachRow((fila, n) => { if (n > 1) numeros.push(String(fila.getCell("B").value)); });
      return numeros;
    };
    const antes = await numerosDelExcel();
    ok("el Excel anterior (generado con las facturas pendientes) NO tenía los números corregidos", !antes.includes(vA.numero), antes.join(", "));
    await pagina.click('[data-testid="regenerar-excel"]:visible');
    await pagina.waitForFunction(() => { const b = document.querySelector('[data-testid="regenerar-excel"]'); return b !== null && !b.hasAttribute("disabled"); }, null, { timeout: 60000 });
    const despues = await numerosDelExcel();
    ok("tras regenerar, el Excel incluye las dos facturas corregidas", despues.includes(vA.numero) && despues.includes(vB.numero), despues.join(", "));
    ok("el lote sigue apuntando a un Excel (el nombre lleva hora y minuto: dentro del mismo minuto se sobrescribe)", Boolean(((await refProceso(procesoId).get()).data() as Proceso).rutaExcel));

    ok("sin errores de consola ni de página", errores.length === 0, errores.join(" | ").slice(0, 300));
  } finally {
    await navegador.close();
    await limpiarLotes([procesoId]);
    console.log("\nDatos de prueba eliminados.");
  }
  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} comprobación(es) fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
