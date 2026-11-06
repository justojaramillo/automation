import { describe, expect, it } from "vitest";
import { calcularDv, dvValido } from "./nit";

describe("dígito de verificación del NIT", () => {
  it.each([
    ["890903938", 8],
    ["860034313", 7],
    ["899999068", 1],
  ])("calcula el DV de %s = %i", (documento, dv) => {
    expect(calcularDv(documento)).toBe(dv);
  });

  it("rechaza un DV incorrecto", () => {
    expect(dvValido("890903938", 8)).toBe(true);
    expect(dvValido("890903938", 3)).toBe(false);
  });

  it("detecta un error de un dígito en el documento", () => {
    expect(dvValido("890903939", 8)).toBe(false);
  });

  it("lanza error si el documento no son solo dígitos", () => {
    expect(() => calcularDv("890.903.938")).toThrow();
  });
});
