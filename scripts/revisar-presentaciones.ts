// Control de calidad de las presentaciones con un navegador real: abre cada mazo, revela todos los pasos de
// cada diapositiva y detecta (1) elementos que se salen del cuadro de 1280×720 y (2) textos SVG que se salen
// de su caja. Guarda una captura por diapositiva.
//   npx tsx scripts/revisar-presentaciones.ts <carpetaCapturas> [mazo ...]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main(): Promise<void> {
  const [capturas, ...mazos] = process.argv.slice(2);
  if (!capturas) throw new Error("Uso: revisar-presentaciones.ts <carpetaCapturas> [01-automatizacion] [02-construccion]");
  const lista = mazos.length ? mazos : ["01-automatizacion", "02-construccion"];
  mkdirSync(capturas, { recursive: true });
  const navegador = await chromium.launch();
  let problemas = 0;
  for (const mazo of lista) {
    const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } });
    const errores: string[] = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    await pagina.goto("file://" + path.resolve("docs/presentaciones", `${mazo}.html`));
    const total = await pagina.locator(".slide").count();
    console.log(`\n== ${mazo}: ${total} diapositivas`);
    for (let i = 0; i < total; i++) {
      await pagina.evaluate((n) => { location.hash = String(n + 1); }, i);
      await pagina.evaluate(() => document.querySelectorAll(".slide.activa .paso").forEach((p) => p.classList.add("visto")));
      await pagina.waitForTimeout(350);
      const fallas = await pagina.evaluate(() => {
        const s = document.querySelector(".slide.activa") as HTMLElement;
        const r = s.getBoundingClientRect();
        const malos: string[] = [];
        // 1) Nada puede salirse del cuadro de la diapositiva (con 2 px de tolerancia)
        s.querySelectorAll("*").forEach((el) => {
          if (el.closest("aside.notas") || el.closest("defs") || el.tagName === "use") return;
          const b = (el as HTMLElement).getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return;
          if (b.right > r.right - 6 || b.bottom > r.bottom - 6 || b.left < r.left + 6 || b.top < r.top + 6) {
            const t = (el.textContent || "").trim().slice(0, 40);
            malos.push(`fuera del cuadro: <${el.tagName.toLowerCase()}> «${t}» (der ${Math.round(b.right - r.right)}, abajo ${Math.round(b.bottom - r.bottom)})`);
          }
        });
        // 2) Los textos SVG no deben pasarse de la caja (rect) que los contiene visualmente
        s.querySelectorAll("svg text").forEach((tx) => {
          const tb = (tx as SVGTextElement).getBoundingClientRect();
          if (tb.width === 0) return;
          const cajas = Array.from(s.querySelectorAll("svg rect.caja, svg path.caja")).filter((c) => {
            const cb = (c as SVGGraphicsElement).getBoundingClientRect();
            const cx = (tb.left + tb.right) / 2, cy = (tb.top + tb.bottom) / 2;
            return cx > cb.left && cx < cb.right && cy > cb.top && cy < cb.bottom;
          });
          const menor = cajas.sort((a, b) => (a as SVGGraphicsElement).getBoundingClientRect().width - (b as SVGGraphicsElement).getBoundingClientRect().width)[0] as SVGGraphicsElement | undefined;
          if (menor) {
            const cb = menor.getBoundingClientRect();
            if (tb.left < cb.left - 1 || tb.right > cb.right + 1) malos.push(`texto se sale de su caja: «${(tx.textContent || "").trim().slice(0, 50)}» (izq ${Math.round(cb.left - tb.left)}, der ${Math.round(tb.right - cb.right)})`);
          }
        });
        // 3) Un diagrama SVG no debe verse encogido (señal de que la diapositiva tiene demasiado contenido)
        s.querySelectorAll("svg[viewBox][width]").forEach((sv) => {
          const ancho = parseFloat(sv.getAttribute("width") || "0");
          const alto = parseFloat(sv.getAttribute("height") || "0");
          const vb = (sv.getAttribute("viewBox") || "").split(/\s+/).map(Number);
          if (!ancho || vb.length < 4) return;
          const caja = sv.getBoundingClientRect();
          // tamaño real del dibujo = el menor entre lo que cabe a lo ancho y a lo alto
          const escala = Math.min(caja.width / vb[2], caja.height / vb[3]);
          const esperado = Math.min(ancho / vb[2], (alto || ancho * vb[3] / vb[2]) / vb[3]);
          if (escala < esperado * 0.88) malos.push(`diagrama encogido al ${Math.round((escala / esperado) * 100)} % (texto pequeño): "${(sv.getAttribute("aria-label") || "").slice(0, 50)}"`);
        });
        // 4) El título no debe ocupar más de una línea
        const h2 = s.querySelector("h2");
        if (h2 && h2.getBoundingClientRect().height > 60) malos.push(`el título ocupa dos líneas: «${(h2.textContent || "").slice(0, 60)}»`);
        return malos;
      });
      const id = String(i + 1).padStart(2, "0");
      await pagina.screenshot({ path: path.join(capturas, `${mazo}-${id}.png`) });
      if (fallas.length) { problemas += fallas.length; console.log(`  diapositiva ${i + 1}:\n    - ${fallas.slice(0, 6).join("\n    - ")}`); }
    }
    if (errores.length) { problemas += errores.length; console.log("  errores de JavaScript:", errores); }
    await pagina.close();
  }
  await navegador.close();
  console.log(problemas === 0 ? "\nSin problemas de maquetación detectados." : `\n${problemas} problema(s) detectado(s).`);
  process.exit(problemas === 0 ? 0 : 1);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
