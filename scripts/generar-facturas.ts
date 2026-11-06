// Generador de facturas sintéticas colombianas (SOLO PROFESOR / pruebas).
//   npm run generar:facturas -- --cantidad 10 --semilla 2026 --salida salida
// Produce:  <salida>/facturas/factura_0001.png|jpg …   (solo imágenes)
//           <salida>/verdad.json                        (respuestas correctas, fuera de la carpeta)
// No usa ningún LLM: todo sale de datos.ts (faker con semilla) + HTML renderizado con Chromium.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, rm, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fakerES as faker } from "@faker-js/faker";
import { calcularDv } from "../src/lib/ocr/nit";
import { calcularTotales, generarDatos, type Calidad, type Factura } from "./generador/datos";
import { NOMBRES_DISENO, renderizar } from "./generador/disenos";

const { values } = parseArgs({
  options: {
    cantidad: { type: "string", default: "10" },
    semilla: { type: "string", default: "2026" },
    salida: { type: "string", default: "salida" },
  },
});
const cantidad = Number(values.cantidad);
const semilla = Number(values.semilla);
if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) throw new Error("--cantidad debe ser un entero entre 1 y 5000");
if (!Number.isInteger(semilla)) throw new Error("--semilla debe ser un entero");

const dirSalida = path.resolve(process.cwd(), values.salida);
const dirFacturas = path.join(dirSalida, "facturas");

const ESCALA = 1.5; // factor de resolución de la captura

/** Degrada la captura según la calidad pedida. Devuelve el archivo final (extensión incluida). */
async function degradar(png: Buffer, calidad: Calidad): Promise<{ datos: Buffer; extension: "png" | "jpg" }> {
  if (calidad === "limpia") return { datos: png, extension: "png" };
  const signo = faker.datatype.boolean() ? 1 : -1;
  const blanco = { r: 255, g: 255, b: 255 };
  if (calidad === "media") {
    const angulo = signo * faker.number.float({ min: 0.5, max: 1.5, fractionDigits: 1 });
    const datos = await sharp(png).rotate(angulo, { background: blanco }).blur(0.6).jpeg({ quality: 70 }).toBuffer();
    return { datos, extension: "jpg" };
  }
  const angulo = signo * faker.number.float({ min: 1.5, max: 3, fractionDigits: 1 });
  const { width } = await sharp(png).metadata();
  const datos = await sharp(png)
    .resize({ width: Math.round((width ?? 1000) * 0.65) })
    .rotate(angulo, { background: blanco })
    .blur(1.0)
    .jpeg({ quality: 38 })
    .toBuffer();
  return { datos, extension: "jpg" };
}

async function main(): Promise<void> {
  const inicio = Date.now();
  const { facturas, clientes } = generarDatos({ cantidad, semilla });

  // Solo borramos lo que este script crea.
  await rm(dirFacturas, { recursive: true, force: true });
  await rm(path.join(dirSalida, "verdad.json"), { force: true });
  await mkdir(dirFacturas, { recursive: true });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ deviceScaleFactor: ESCALA });
  const pagina = await contexto.newPage();

  for (const f of facturas) {
    const { html, ancho } = renderizar(f);
    await pagina.setViewportSize({ width: ancho, height: 600 });
    await pagina.setContent(html, { waitUntil: "load" });
    const captura = await pagina.screenshot({ fullPage: true, type: "png" });
    const { datos, extension } = await degradar(captura, f.calidad);
    f.archivo = `${f.archivo}.${extension}`;
    await writeFile(path.join(dirFacturas, f.archivo), datos);
  }
  await navegador.close();

  const verdad = {
    generado: new Date().toISOString(),
    semilla,
    cantidad,
    clientes: clientes.map((c) => ({ documento: c.documento, dv: c.dv, nombre: c.nombre })),
    facturas: facturas.map((f) => ({
      archivo: f.archivo,
      numero: f.numero,
      fecha: f.fecha,
      hora: f.hora,
      fechaVencimiento: f.fechaVencimiento,
      formaPago: f.formaPago,
      medioPago: f.medioPago,
      proveedor: { nombre: f.proveedor.nombre, nit: f.proveedor.documento, dv: f.proveedor.dv },
      cliente: { documento: f.cliente.documento, dv: f.cliente.dv, nombre: f.cliente.nombre },
      items: f.items,
      subtotal: f.subtotal,
      iva: f.iva,
      impoconsumo: f.impoconsumo,
      total: f.total,
      esMovil: f.esMovil,
      cufe: f.cufe,
      diseno: NOMBRES_DISENO[f.diseno],
      calidad: f.calidad,
      formatoFecha: f.formatoFecha,
    })),
  };
  await writeFile(path.join(dirSalida, "verdad.json"), JSON.stringify(verdad, null, 2), "utf8");

  await resumen(facturas, Date.now() - inicio);
}

/** Comprobaciones al terminar: si algo no cuadra, el script falla (exit 1). */
async function resumen(facturas: Factura[], ms: number): Promise<void> {
  const archivos = await readdir(dirFacturas);
  let bytes = 0;
  for (const a of archivos) bytes += (await stat(path.join(dirFacturas, a))).size;

  const docs = facturas.map((f) => f.cliente.documento);
  const distintos = new Set(docs).size;
  const numerosUnicos = new Set(facturas.map((f) => f.numero)).size;
  const conteo = <T extends string>(valores: T[]): Record<string, number> =>
    valores.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});

  const errores: string[] = [];
  if (archivos.length !== facturas.length) errores.push(`imágenes (${archivos.length}) ≠ facturas (${facturas.length})`);
  if (numerosUnicos !== facturas.length) errores.push("hay números de factura repetidos");
  for (const f of facturas) {
    const t = calcularTotales(f.items);
    if (t.subtotal !== f.subtotal || t.iva !== f.iva || t.impoconsumo !== f.impoconsumo || t.total !== f.total) errores.push(`${f.numero}: totales no cuadran`);
    if (f.subtotal + f.iva + f.impoconsumo !== f.total) errores.push(`${f.numero}: subtotal + IVA + INC ≠ total`);
    if (f.esMovil !== (f.impoconsumo > 0)) errores.push(`${f.numero}: impoconsumo inconsistente con esMovil`);
    if (calcularDv(f.cliente.documento) !== f.cliente.dv || calcularDv(f.proveedor.documento) !== f.proveedor.dv) errores.push(`${f.numero}: DV inválido`);
  }

  console.log(`\nFacturas generadas en ${dirFacturas}`);
  console.log(`  imágenes:            ${archivos.length}`);
  console.log(`  clientes distintos:  ${distintos}  (repeticiones: ${facturas.length - distintos})`);
  console.log(`  números repetidos:   ${facturas.length - numerosUnicos}`);
  console.log(`  con impoconsumo 4%:  ${facturas.filter((f) => f.esMovil).length}`);
  console.log(`  diseños:             ${JSON.stringify(conteo(facturas.map((f) => NOMBRES_DISENO[f.diseno])))}`);
  console.log(`  calidad:             ${JSON.stringify(conteo(facturas.map((f) => f.calidad)))}`);
  console.log(`  tamaño total:        ${(bytes / 1024 / 1024).toFixed(2)} MB   (${(ms / 1000).toFixed(1)} s)`);
  if (errores.length > 0) {
    console.error("\nERRORES:\n - " + errores.join("\n - "));
    process.exit(1);
  }
  console.log("  comprobaciones aritméticas y de DV: OK");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
