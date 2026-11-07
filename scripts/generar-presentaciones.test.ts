// Guardas de las presentaciones: lo guardado coincide con su fuente, cada diapositiva tiene notas para el
// profesor, los enlaces internos existen y nada depende de internet (se proyectan en clase, quizá sin red).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { construirPresentaciones } from "./generar-presentaciones";

const raiz = process.cwd();
const base = path.join(raiz, "docs", "presentaciones");
const generadas = construirPresentaciones(raiz);

describe("presentaciones HTML", () => {
  it.each(Object.keys(generadas))("%s coincide con su fuente (si falla: npm run presentaciones)", (nombre) => {
    expect(readFileSync(path.join(base, nombre), "utf8")).toBe(generadas[nombre]);
  });

  it.each(Object.entries(generadas))("%s: cada diapositiva tiene notas del profesor e id único", (nombre, html) => {
    const slides = html.match(/<section class="slide"[^>]*>[\s\S]*?<\/section>/g) ?? [];
    expect(slides.length).toBeGreaterThanOrEqual(26);
    for (const s of slides) expect(s).toContain('<aside class="notas">');
    const ids = [...html.matchAll(/<section class="slide" id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, `ids repetidos en ${nombre}`).toBe(slides.length);
  });

  it("los enlaces internos de las presentaciones existen", () => {
    const todos = [...Object.values(generadas), readFileSync(path.join(base, "index.html"), "utf8")].join("\n");
    const enlaces = [...todos.matchAll(/href="([A-Za-z0-9_.-]+\.(?:html|css))"/g)].map((m) => m[1]);
    expect(enlaces.length).toBeGreaterThan(3);
    expect(enlaces.filter((e) => !existsSync(path.join(base, e)))).toEqual([]);
    expect(existsSync(path.join(base, "deck.js"))).toBe(true);
  });

  it("las tuercas giran sobre su centro con animateTransform (no con CSS sobre <use>, que las desplazaba)", () => {
    for (const html of Object.values(generadas)) {
      expect(html).not.toContain('class="gira"');
      for (const g of html.match(/<g class="tuerca">[\s\S]*?<\/g>/g) ?? []) {
        const x = Number(g.match(/ x="([\d.]+)"/)?.[1]), y = Number(g.match(/ y="([\d.]+)"/)?.[1]);
        const w = Number(g.match(/ width="([\d.]+)"/)?.[1]), h = Number(g.match(/ height="([\d.]+)"/)?.[1]);
        const centro = g.match(/from="0 ([\d.]+) ([\d.]+)"/);
        expect(centro, "falta animateTransform").not.toBeNull();
        expect(Number(centro![1])).toBeCloseTo(x + w / 2, 1);
        expect(Number(centro![2])).toBeCloseTo(y + h / 2, 1);
      }
    }
  });

  it("no cargan nada de internet (funcionan sin conexión)", () => {
    const todos = [...Object.values(generadas), readFileSync(path.join(base, "index.html"), "utf8"), readFileSync(path.join(base, "deck.css"), "utf8"), readFileSync(path.join(base, "deck.js"), "utf8")].join("\n");
    expect(todos).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(todos).not.toMatch(/@import\s+url\(/);
  });
});
