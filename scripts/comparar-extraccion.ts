// Herramienta de desarrollo: compara extraer() sobre los textos OCR guardados con verdad.json.
//   npx tsx scripts/comparar-extraccion.ts <carpetaTxt> <verdad.json> [modo]
import { readFileSync } from "node:fs";
import { extraer } from "../src/lib/ocr/extractor";
import { validar } from "../src/lib/ocr/validador";

interface Verdad {
  facturas: {
    archivo: string; numero: string; fecha: string; subtotal: number; iva: number; impoconsumo: number; total: number;
    proveedor: { nombre: string; nit: string }; cliente: { documento: string; nombre: string };
    items: { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  }[];
}
const [dir, verdadPath, modo = "original"] = process.argv.slice(2);
const verdad = JSON.parse(readFileSync(verdadPath, "utf8")) as Verdad;
const norm = (v: unknown): unknown => typeof v === "string" ? v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim() : v;
let campos = 0, ok = 0;
for (const f of verdad.facturas) {
  const p = extraer(readFileSync(`${dir}/${f.archivo}.${modo}.txt`, "utf8"));
  const motivos = validar(p);
  const esperado: Record<string, unknown> = {
    numero: f.numero, fecha: f.fecha, proveedor: f.proveedor.nombre, nitProveedor: f.proveedor.nit,
    clienteDocumento: f.cliente.documento, clienteNombre: f.cliente.nombre, subtotal: f.subtotal, iva: f.iva,
    impoconsumo: f.impoconsumo, total: f.total, nItems: f.items.length,
  };
  const obtenido: Record<string, unknown> = {
    ...p, impoconsumo: p.impoconsumo ?? 0, nItems: p.items.length,
  };
  const malos: string[] = [];
  for (const [k, v] of Object.entries(esperado)) {
    campos++;
    if (norm(obtenido[k]) === norm(v)) ok++; else malos.push(`${k}: esperado ${JSON.stringify(v)} obtenido ${JSON.stringify(obtenido[k])}`);
  }
  f.items.forEach((it, i) => {
    const o = p.items[i];
    if (!o || o.cantidad !== it.cantidad || o.precioUnitario !== it.precioUnitario || o.subtotal !== it.subtotal || norm(o.descripcion) !== norm(it.descripcion))
      malos.push(`ítem ${i + 1}: esperado ${JSON.stringify(it.descripcion)} ${it.cantidad}×${it.precioUnitario} obtenido ${JSON.stringify(o)}`);
  });
  console.log(`${f.archivo} [${motivos.length ? "REVISIÓN" : "aceptada"}] ${malos.length ? "ERRORES:" : "perfecta"}`);
  malos.forEach((x) => console.log("   - " + x));
  motivos.forEach((x) => console.log("   · motivo: " + x));
}
console.log(`\nCampos simples correctos: ${ok}/${campos}`);
