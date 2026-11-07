// Guardas de la documentación: AGENTS.md y CLAUDE.md deben coincidir con su fuente, y la guía solo puede
// mencionar archivos, variables y comandos que existan de verdad (una guía desactualizada hace que la IA
// de un estudiante invente código).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { construirDocs } from "./generar-docs";

const raiz = process.cwd();
const docs = construirDocs(raiz);
const guia = docs["AGENTS.md"];

describe("documentación para estudiantes y su IA", () => {
  it.each(["AGENTS.md", "CLAUDE.md"] as const)("%s coincide con docs/fuente (si falla: npm run docs)", (nombre) => {
    expect(readFileSync(path.join(raiz, nombre), "utf8")).toBe(docs[nombre]);
  });

  it("AGENTS.md conserva el bloque de reglas de Next.js que mantiene `next dev`", () => {
    expect(guia).toContain("<!-- BEGIN:nextjs-agent-rules -->");
    expect(guia).toContain("<!-- END:nextjs-agent-rules -->");
  });

  it("AGENTS.md y CLAUDE.md llevan el mismo paso a paso (mismas fases)", () => {
    const fases = (t: string) => [...t.matchAll(/^### (Fase [^\n]+)$/gm)].map((m) => m[1]);
    expect(fases(docs["CLAUDE.md"])).toEqual(fases(guia));
    expect(fases(guia).length).toBeGreaterThanOrEqual(11);
  });

  it("todas las rutas de archivos mencionadas en la guía existen", () => {
    const rutas = new Set([...guia.matchAll(/`((?:src|scripts|docs)\/[A-Za-z0-9_\-./[\]]+\.(?:ts|tsx|md|json))`/g)].map((m) => m[1]));
    const faltan = [...rutas].filter((r) => !existsSync(path.join(raiz, r)));
    expect(faltan).toEqual([]);
    expect(rutas.size).toBeGreaterThan(30);
  });

  it("todos los comandos `npm run X` mencionados existen en package.json", () => {
    const scripts = Object.keys((JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts);
    const usados = new Set([...guia.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]));
    expect([...usados].filter((s) => !scripts.includes(s))).toEqual([]);
  });

  it("todas las variables de .env.example están explicadas en la guía", () => {
    const nombres = readFileSync(path.join(raiz, ".env.example"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => l.split("=")[0])
      .filter((n) => n !== "DEEPSEEK_API_KEY"); // opcional y no se usa en el flujo
    expect(nombres.filter((n) => !guia.includes(n))).toEqual([]);
  });
});
