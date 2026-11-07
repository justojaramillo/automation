import { describe, expect, it } from "vitest";
import { validar } from "@/lib/ocr/validador";
import { aEntero, aParcial, soloDigitos, totalesSugeridos, type DatosManuales } from "./correccion";
import { esquemaCorreccion, esquemaDatosManuales } from "./correccion-esquema";

// Una factura real del conjunto del curso (telefonía móvil: lleva impoconsumo).
const bien: DatosManuales = {
  numero: "FE-000009", fecha: "2026-07-09", proveedor: "Comunicaciones Móviles Zúñiga Ortega Ltda.",
  nitProveedor: "821361310", dvProveedor: 5, clienteDocumento: "845990123", clienteDv: 1, clienteNombre: "Corporación Montoya Luevano S.A.S.",
  items: [
    { descripcion: "Paquete adicional de datos móviles 10 GB", cantidad: 20, precioUnitario: 22700, subtotal: 454000 },
    { descripcion: "Paquete de roaming internacional semanal", cantidad: 2, precioUnitario: 65500, subtotal: 131000 },
  ],
  subtotal: 585000, iva: 111150, impoconsumo: 23400, total: 719550,
};

describe("totales sugeridos para el formulario", () => {
  it("IVA 19 %, impoconsumo 4 % solo si aplica, total = suma", () => {
    expect(totalesSugeridos(bien.items, true)).toEqual({ subtotal: 585000, iva: 111150, impoconsumo: 23400, total: 719550 });
    expect(totalesSugeridos(bien.items, false)).toEqual({ subtotal: 585000, iva: 111150, impoconsumo: 0, total: 696150 });
    expect(totalesSugeridos([], true)).toEqual({ subtotal: 0, iva: 0, impoconsumo: 0, total: 0 });
  });
  it("lo que se propone siempre pasa las validaciones de los importes", () => {
    for (const aplica of [true, false]) {
      const t = totalesSugeridos(bien.items, aplica);
      expect(validar(aParcial({ ...bien, ...t }))).toEqual([]);
    }
  });
});

describe("la validación del formulario es la misma del OCR", () => {
  it("una factura correcta no tiene motivos", () => expect(validar(aParcial(bien))).toEqual([]));
  it("detecta un total que no cuadra", () => {
    expect(validar(aParcial({ ...bien, total: 719000 })).join()).toMatch(/total/);
  });
  it("detecta un dígito de verificación equivocado en el cliente y en el proveedor", () => {
    expect(validar(aParcial({ ...bien, clienteDv: 2 })).join()).toMatch(/cliente.*dígito/);
    expect(validar(aParcial({ ...bien, dvProveedor: 9 })).join()).toMatch(/proveedor.*dígito/);
  });
  it("detecta ítems que no suman y campos vacíos", () => {
    expect(validar(aParcial({ ...bien, items: [bien.items[0]] })).join()).toMatch(/ítems suman/);
    const motivos = validar(aParcial({ ...bien, numero: "", fecha: "", proveedor: "" }));
    expect(motivos).toContain("Falta el número de factura");
    expect(motivos).toContain("Falta la fecha de emisión");
    expect(motivos).toContain("Falta el proveedor");
  });
  it("sin impoconsumo (0) no se exige ni se menciona", () => {
    const sin = { ...bien, ...totalesSugeridos(bien.items, false) };
    expect(aParcial(sin).impoconsumo).toBeNull();
    expect(validar(aParcial(sin))).toEqual([]);
  });
});

describe("entradas de texto del formulario", () => {
  it("extrae dígitos e importes enteros", () => {
    expect(soloDigitos("900.123.456")).toBe("900123456");
    expect(aEntero("$ 1.234.567")).toBe(1234567);
    expect(aEntero("")).toBe(0);
    expect(aEntero("abc")).toBe(0);
  });
});

describe("esquema de entrada del servidor (no se confía en el navegador)", () => {
  it("acepta datos válidos y normaliza el número a mayúsculas", () => {
    const r = esquemaDatosManuales.safeParse({ ...bien, numero: " fe-000009 " });
    expect(r.success).toBe(true);
    expect(r.success && r.data.numero).toBe("FE-000009");
  });
  it.each([
    ["número con formato raro", { numero: "123" }],
    ["fecha inexistente", { fecha: "2026-02-30" }],
    ["fecha con otro formato", { fecha: "09/07/2026" }],
    ["NIT con puntos", { nitProveedor: "821.361.310" }],
    ["DV de dos cifras", { dvProveedor: 10 }],
    ["razón social vacía", { proveedor: " " }],
    ["sin ítems", { items: [] }],
    ["importe negativo", { total: -1 }],
    ["importe con decimales", { iva: 10.5 }],
    ["cantidad cero", { items: [{ descripcion: "x", cantidad: 0, precioUnitario: 10, subtotal: 0 }] }],
  ])("rechaza: %s", (_titulo, cambio) => {
    expect(esquemaDatosManuales.safeParse({ ...bien, ...cambio }).success).toBe(false);
  });
  it("«confirmado» es falso por defecto", () => {
    const r = esquemaCorreccion.parse({ datos: bien });
    expect(r.confirmado).toBe(false);
  });
});
