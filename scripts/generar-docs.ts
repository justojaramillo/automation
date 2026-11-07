// Arma AGENTS.md y CLAUDE.md a partir de UNA sola fuente (docs/fuente/), para que los dos lleven exactamente
// el mismo paso a paso y no se desincronicen:
//   AGENTS.md = cabecera-agents.md (incluye el bloque de reglas de Next.js) + guía
//   CLAUDE.md = cabecera-claude.md (reglas para Claude Code + estado del repo de referencia) + guía
// La guía es la concatenación ordenada de docs/fuente/guia/*.md.
//   npm run docs          → escribe los dos archivos
// `npm test` falla si los archivos del repositorio no coinciden con lo que este script produce.
// (Si tu repositorio no tiene este script, puedes editar AGENTS.md y CLAUDE.md directamente.)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const AVISO =
  "<!-- Archivo GENERADO por `npm run docs` (scripts/generar-docs.ts) a partir de docs/fuente/. Edita la fuente, no este archivo. -->\n\n";

export function construirDocs(raiz: string = process.cwd()): { "AGENTS.md": string; "CLAUDE.md": string } {
  const fuente = path.join(raiz, "docs", "fuente");
  const leer = (...partes: string[]): string => readFileSync(path.join(fuente, ...partes), "utf8").trimEnd();
  const guia = readdirSync(path.join(fuente, "guia"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => leer("guia", f))
    .join("\n\n");
  return {
    "AGENTS.md": `${leer("cabecera-agents.md")}\n\n${AVISO}${guia}\n`,
    "CLAUDE.md": `${leer("cabecera-claude.md")}\n\n${AVISO}${guia}\n`,
  };
}

if (process.argv[1]?.endsWith("generar-docs.ts")) {
  const docs = construirDocs();
  for (const [nombre, contenido] of Object.entries(docs)) {
    writeFileSync(path.join(process.cwd(), nombre), contenido, "utf8");
    console.log(`${nombre}: ${contenido.split("\n").length} líneas`);
  }
}
