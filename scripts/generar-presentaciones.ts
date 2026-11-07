// Ensambla las presentaciones HTML a partir de fragmentos: docs/presentaciones/fuente/plantilla.html +
// una diapositiva por archivo en docs/presentaciones/fuente/<mazo>/*.html (en orden alfabético).
//   npm run presentaciones
// Salida (autocontenida salvo deck.css y deck.js, que viven en la misma carpeta):
//   docs/presentaciones/01-automatizacion.html  y  docs/presentaciones/02-construccion.html
// `npm test` comprueba que lo guardado coincida con lo que este script produce.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAZOS = [
  { carpeta: "automatizacion", salida: "01-automatizacion.html", titulo: "Automatización: qué es y cómo pensarla" },
  { carpeta: "construccion", salida: "02-construccion.html", titulo: "Construcción del procesador de facturas, paso a paso" },
] as const;

export function construirPresentaciones(raiz: string = process.cwd()): Record<string, string> {
  const base = path.join(raiz, "docs", "presentaciones");
  const plantilla = readFileSync(path.join(base, "fuente", "plantilla.html"), "utf8");
  const salida: Record<string, string> = {};
  for (const m of MAZOS) {
    const dir = path.join(base, "fuente", m.carpeta);
    const diapositivas = readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8").trim())
      .join("\n\n");
    salida[m.salida] = plantilla.replace("{{TITULO}}", m.titulo).replace("{{DIAPOSITIVAS}}", diapositivas);
  }
  return salida;
}

if (process.argv[1]?.endsWith("generar-presentaciones.ts")) {
  const base = path.join(process.cwd(), "docs", "presentaciones");
  for (const [nombre, contenido] of Object.entries(construirPresentaciones())) {
    writeFileSync(path.join(base, nombre), contenido, "utf8");
    console.log(`${nombre}: ${(contenido.match(/class="slide"/g) ?? []).length} diapositivas, ${(contenido.length / 1024).toFixed(0)} KB`);
  }
}
