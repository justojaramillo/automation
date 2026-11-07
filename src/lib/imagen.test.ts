import { describe, expect, it } from "vitest";
import { detectarTipoImagen, nombreConExtension } from "./imagen";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("validación de imágenes por sus bytes", () => {
  it("reconoce PNG y JPEG por la firma del archivo", () => {
    expect(detectarTipoImagen(png)).toBe("image/png");
    expect(detectarTipoImagen(jpg)).toBe("image/jpeg");
  });
  it("rechaza lo que no es imagen aunque se llame .png (no confía en el nombre)", () => {
    expect(detectarTipoImagen(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(detectarTipoImagen(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectarTipoImagen(new Uint8Array(0))).toBeNull();
    expect(detectarTipoImagen(Uint8Array.from([0x89, 0x50]))).toBeNull();
  });
  it("la extensión final corresponde al tipo real, no al declarado", () => {
    expect(nombreConExtension("factura_0001.jpg", "image/png")).toBe("factura_0001.png");
    expect(nombreConExtension("foto.jpeg", "image/jpeg")).toBe("foto.jpg");
    expect(nombreConExtension("sin_extension", "image/png")).toBe("sin_extension.png");
    expect(nombreConExtension("", "image/jpeg")).toBe("imagen.jpg");
  });
});
