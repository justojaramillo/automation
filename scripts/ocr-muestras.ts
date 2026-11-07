// Herramienta de desarrollo (Fase 4/5): corre el OCR sobre las imágenes de salida/facturas y
// guarda el texto en una carpeta, para diseñar el extractor con texto REAL del OCR.
//   npx tsx scripts/ocr-muestras.ts <carpetaImagenes> <carpetaSalidaTxt>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { leerImagen, type ModoOcr } from "../src/lib/ocr/motor";

async function main(): Promise<void> {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada || !salida) throw new Error("Uso: ocr-muestras.ts <imagenes> <salidaTxt>");
  mkdirSync(salida, { recursive: true });
  for (const archivo of readdirSync(entrada).sort()) {
    if (!/\.(png|jpe?g)$/i.test(archivo)) continue;
    const buffer = readFileSync(path.join(entrada, archivo));
    for (const modo of ["original", "preprocesado", "encabezado"] as ModoOcr[]) {
      const t0 = Date.now();
      const r = await leerImagen(buffer, modo);
      writeFileSync(path.join(salida, `${archivo}.${modo}.txt`), r.texto);
      console.log(`${archivo} ${modo}: ${Date.now() - t0} ms, confianza ${r.confianza.toFixed(0)}`);
    }
  }
  process.exit(0);
}
main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
