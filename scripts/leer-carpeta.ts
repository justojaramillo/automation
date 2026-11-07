// Fase 4/5 en local: corre la estrategia completa (leerFactura) sobre una carpeta y la compara con
// verdad.json. Imprime aceptadas/revisión y exactitud por campo.
//   npx tsx scripts/leer-carpeta.ts salida/facturas salida/verdad.json
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { leerFactura } from "../src/lib/ocr/leer-factura";

interface Verdad {
  facturas: { archivo: string; numero: string; fecha: string; subtotal: number; iva: number; impoconsumo: number; total: number;
    proveedor: { nit: string }; cliente: { documento: string }; items: unknown[] }[];
}

async function main(): Promise<void> {
  const [carpeta, verdadPath] = process.argv.slice(2);
  const verdad = JSON.parse(readFileSync(verdadPath, "utf8")) as Verdad;
  const porArchivo = new Map(verdad.facturas.map((f) => [f.archivo, f]));
  const campos = ["numero", "fecha", "nitProveedor", "clienteDocumento", "subtotal", "iva", "impoconsumo", "total", "nItems"] as const;
  const aciertos: Record<string, number> = Object.fromEntries(campos.map((c) => [c, 0]));
  let aceptadas = 0, perfectas = 0, aceptadasConError = 0, n = 0;
  const t0 = Date.now();
  for (const archivo of readdirSync(carpeta).sort()) {
    const v = porArchivo.get(archivo);
    if (!v) continue;
    n++;
    const t1 = Date.now();
    const r = await leerFactura(readFileSync(path.join(carpeta, archivo)));
    const p = r.parcial;
    const obtenido = { numero: p.numero, fecha: p.fecha, nitProveedor: p.nitProveedor, clienteDocumento: p.clienteDocumento,
      subtotal: p.subtotal, iva: p.iva, impoconsumo: p.impoconsumo ?? 0, total: p.total, nItems: p.items.length };
    const esperado = { numero: v.numero, fecha: v.fecha, nitProveedor: v.proveedor.nit, clienteDocumento: v.cliente.documento,
      subtotal: v.subtotal, iva: v.iva, impoconsumo: v.impoconsumo, total: v.total, nItems: v.items.length };
    const malos = campos.filter((c) => obtenido[c] !== esperado[c]);
    campos.forEach((c) => { if (obtenido[c] === esperado[c]) aciertos[c]++; });
    const acepta = r.motivos.length === 0;
    if (acepta) { aceptadas++; if (malos.length === 0) perfectas++; else aceptadasConError++; }
    console.log(`${archivo}: ${acepta ? "aceptada " : "REVISIÓN "} ${Date.now() - t1} ms modos=${r.modos.join(">")} ${malos.length ? "ERRORES en " + malos.join(",") : "ok"}${acepta ? "" : " | " + r.motivos[0]}`);
  }
  console.log(`\n${n} facturas en ${((Date.now() - t0) / 1000).toFixed(1)} s | aceptadas ${aceptadas} (${(100 * aceptadas / n).toFixed(0)} %), revisión ${n - aceptadas}`);
  console.log(`aceptadas totalmente correctas: ${perfectas} | aceptadas con error NO detectado: ${aceptadasConError}`);
  console.log("exactitud por campo:", Object.entries(aciertos).map(([c, a]) => `${c} ${a}/${n}`).join(", "));
  process.exit(0);
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
