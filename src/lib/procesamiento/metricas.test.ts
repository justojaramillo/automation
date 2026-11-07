import { describe, expect, it } from "vitest";
import { calcularTasas, cambiosDe, cambiosManual, metricasDesdeEventos, metricasVacias, proveedoresOrdenados, sumarMetricas, type ImportesManual } from "./metricas";

const factura = (estado: "aceptada" | "revision", over = {}) =>
  cambiosDe({ tipo: "factura", estado, subtotal: 100000, iva: 19000, impoconsumo: 0, total: 119000, clienteNuevo: false, nitProveedor: "883800871", proveedor: "Soluciones TI S.A.S.", ...over });

describe("cambios de métricas", () => {
  it("una factura aceptada suma importes del grupo y del proveedor", () => {
    const c = factura("aceptada");
    expect(c).toContainEqual({ ruta: ["metricas", "aceptadas", "subtotal"], incremento: 100000 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "883800871", "total"], incremento: 119000 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "883800871", "nombre"], texto: "Soluciones TI S.A.S." });
  });
  it("una factura en revisión NO entra al desglose por proveedor (su NIT puede estar mal leído)", () => {
    const c = factura("revision");
    expect(c.some((x) => x.ruta.includes("proveedores"))).toBe(false);
    expect(c).toContainEqual({ ruta: ["metricas", "revision", "n"], incremento: 1 });
  });
  it("importes no leídos cuentan como 0 y el cliente nuevo suma", () => {
    const c = factura("revision", { subtotal: null, iva: null, total: null, clienteNuevo: true });
    expect(c).toContainEqual({ ruta: ["metricas", "revision", "subtotal"], incremento: 0 });
    expect(c).toContainEqual({ ruta: ["metricas", "clientesNuevos"], incremento: 1 });
  });
  it("duplicada y error solo incrementan su contador", () => {
    expect(cambiosDe({ tipo: "duplicada" })).toEqual([{ ruta: ["metricas", "duplicadas"], incremento: 1 }]);
    expect(cambiosDe({ tipo: "error" })).toEqual([{ ruta: ["metricas", "errores"], incremento: 1 }]);
  });
});

describe("suma y tasas", () => {
  const lote1 = { ...metricasVacias(), aceptadas: { n: 90, subtotal: 9000, iva: 1710, impoconsumo: 100, total: 10810 }, revision: { n: 8, subtotal: 800, iva: 152, impoconsumo: 0, total: 952 }, errores: 2, duplicadas: 5,
    proveedores: { "1": { nombre: "Uno", n: 90, subtotal: 9000, iva: 1710, impoconsumo: 100, total: 10810 } } };
  const lote2 = { ...metricasVacias(), aceptadas: { n: 80, subtotal: 8000, iva: 1520, impoconsumo: 0, total: 9520 }, revision: { n: 20, subtotal: 0, iva: 0, impoconsumo: 0, total: 0 },
    proveedores: { "1": { nombre: "Uno", n: 50, subtotal: 5000, iva: 950, impoconsumo: 0, total: 5950 }, "2": { nombre: "Dos", n: 30, subtotal: 3000, iva: 570, impoconsumo: 0, total: 3570 } } };

  it("suma lotes y proveedores por NIT", () => {
    const t = sumarMetricas([lote1, lote2, undefined, {}]);
    expect(t.aceptadas.n).toBe(170);
    expect(t.aceptadas.total).toBe(20330);
    expect(t.errores).toBe(2);
    expect(t.duplicadas).toBe(5);
    expect(t.proveedores["1"].n).toBe(140);
    expect(proveedoresOrdenados(t).map((p) => p.nit)).toEqual(["1", "2"]);
  });
  it("tasas por lote: correctas / total y mal leídas / total (duplicadas no cuentan)", () => {
    const t = calcularTasas(lote1);
    expect(t).toMatchObject({ total: 100, correctas: 90, malLeidas: 10, pctCorrectas: 90, pctMalLeidas: 10 });
  });
  it("correctas + mal leídas = 100 % y sin facturas no hay porcentaje", () => {
    const t = calcularTasas(sumarMetricas([lote1, lote2]));
    expect((t.pctCorrectas ?? 0) + (t.pctMalLeidas ?? 0)).toBeCloseTo(100, 0);
    expect(calcularTasas(metricasVacias()).pctCorrectas).toBeNull();
  });
});

describe("recalcular un lote desde sus eventos", () => {
  it("da lo mismo que sumar los cambios uno a uno", () => {
    const f = (estado: "aceptada" | "revision", total: number, nit: string) =>
      ({ tipo: "factura", estado, subtotal: total / 2, iva: 10, impoconsumo: 0, total, clienteNuevo: estado === "aceptada", nitProveedor: nit, proveedor: `Prov ${nit}` }) as const;
    const m = metricasDesdeEventos([f("aceptada", 100, "1"), f("aceptada", 300, "1"), f("revision", 50, "2"), { tipo: "duplicada" }, { tipo: "error" }]);
    expect(m.aceptadas).toEqual({ n: 2, subtotal: 200, iva: 20, impoconsumo: 0, total: 400 });
    expect(m.revision.n).toBe(1);
    expect(m.errores).toBe(1);
    expect(m.duplicadas).toBe(1);
    expect(m.clientesNuevos).toBe(2);
    expect(m.proveedores["1"]).toEqual({ nombre: "Prov 1", n: 2, subtotal: 200, iva: 20, impoconsumo: 0, total: 400 });
    expect(m.proveedores["2"]).toBeUndefined();
  });
});

describe("correcciones manuales en las métricas", () => {
  const base: ImportesManual = { subtotal: 1000, iva: 190, impoconsumo: 0, total: 1190, nitProveedor: "111", proveedor: "Uno S.A.S." };

  it("primera corrección: suma una factura a «manuales» y al proveedor, sin tocar las de la máquina", () => {
    const c = cambiosManual({ ...base, clienteNuevo: true });
    expect(c).toContainEqual({ ruta: ["metricas", "manuales", "n"], incremento: 1 });
    expect(c).toContainEqual({ ruta: ["metricas", "manuales", "total"], incremento: 1190 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "111", "n"], incremento: 1 });
    expect(c).toContainEqual({ ruta: ["metricas", "clientesNuevos"], incremento: 1 });
    expect(c.some((x) => x.ruta[1] === "aceptadas" || x.ruta[1] === "revision" || x.ruta[1] === "errores")).toBe(false);
  });
  it("volver a editar: solo la diferencia, sin sumar otra factura", () => {
    const c = cambiosManual({ ...base, total: 1500, subtotal: 1260 }, base);
    expect(c.some((x) => x.ruta.join() === "metricas,manuales,n")).toBe(false);
    expect(c).toContainEqual({ ruta: ["metricas", "manuales", "total"], incremento: 310 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "111", "total"], incremento: 310 });
    expect(c.some((x) => x.ruta.join() === "metricas,manuales,iva")).toBe(false); // sin cambio: no se escribe
  });
  it("si cambia el NIT del proveedor: se resta del anterior y se suma al nuevo", () => {
    const c = cambiosManual({ ...base, nitProveedor: "222", proveedor: "Dos S.A.S." }, base);
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "111", "n"], incremento: -1 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "111", "total"], incremento: -1190 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "222", "n"], incremento: 1 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "222", "total"], incremento: 1190 });
    expect(c).toContainEqual({ ruta: ["metricas", "proveedores", "222", "nombre"], texto: "Dos S.A.S." });
  });
  it("las tasas de la máquina no cambian; se informa cuántas faltan por revisar", () => {
    const m = { ...metricasVacias(), aceptadas: { n: 90, subtotal: 0, iva: 0, impoconsumo: 0, total: 0 }, revision: { n: 8, subtotal: 0, iva: 0, impoconsumo: 0, total: 0 }, errores: 2, manuales: { n: 6, subtotal: 6000, iva: 1140, impoconsumo: 0, total: 7140 } };
    expect(calcularTasas(m)).toMatchObject({ total: 100, correctas: 90, malLeidas: 10, pctCorrectas: 90, pctMalLeidas: 10, revisadasAMano: 6, pendientes: 4 });
  });
  it("suma y recalcula lotes con facturas manuales", () => {
    const a = metricasDesdeEventos([{ tipo: "manual", clienteNuevo: false, ...base }, { tipo: "manual", clienteNuevo: true, ...base }]);
    expect(a.manuales).toEqual({ n: 2, subtotal: 2000, iva: 380, impoconsumo: 0, total: 2380 });
    expect(a.proveedores["111"]).toMatchObject({ n: 2, total: 2380 });
    expect(a.clientesNuevos).toBe(1);
    expect(sumarMetricas([a, a]).manuales.n).toBe(4);
  });
});
