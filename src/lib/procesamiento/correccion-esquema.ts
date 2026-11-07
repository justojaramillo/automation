// Esquema de la revisión manual. El servidor lo usa para NO confiar en lo que manda el navegador; el formulario
// lo usa para avisar del formato antes de enviar (por eso los mensajes están en español).

import { z } from "zod";

const entero = z.number({ error: "Falta un importe" }).int("Los importes son enteros, sin decimales").min(0, "Un importe no puede ser negativo").max(1_000_000_000_000, "Importe demasiado grande");
const digito = z.number({ error: "Falta el dígito de verificación (0 a 9)" }).int("El dígito de verificación va de 0 a 9").min(0, "El dígito de verificación va de 0 a 9").max(9, "El dígito de verificación va de 0 a 9");

const fechaReal = (s: string): boolean => {
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d && a >= 2000 && a <= 2100;
};

export const esquemaDatosManuales = z.object({
  numero: z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}-\d{3,10}$/, "El número debe verse como FE-000123"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser aaaa-mm-dd").refine(fechaReal, "La fecha no existe"),
  proveedor: z.string().trim().min(2, "Falta la razón social").max(200),
  nitProveedor: z.string().regex(/^\d{6,10}$/, "El NIT del proveedor son 6 a 10 dígitos, sin puntos ni guion"),
  dvProveedor: digito,
  clienteDocumento: z.string().regex(/^\d{6,12}$/, "El documento del cliente son 6 a 12 dígitos, sin puntos ni guion"),
  clienteDv: digito,
  clienteNombre: z.string().trim().max(200),
  items: z
    .array(
      z.object({
        descripcion: z.string().trim().min(1, "Cada ítem necesita descripción").max(300),
        cantidad: z.number({ error: "Falta la cantidad" }).int("La cantidad es un número entero").min(1, "La cantidad mínima es 1").max(99_999, "Cantidad demasiado grande"),
        precioUnitario: entero,
        subtotal: entero,
      }),
    )
    .min(1, "Hace falta al menos un ítem")
    .max(60),
  subtotal: entero,
  iva: entero,
  impoconsumo: entero,
  total: entero,
});

export const esquemaCorreccion = z.object({
  datos: esquemaDatosManuales,
  /** La persona confirma que revisó la imagen aunque alguna validación automática no cuadre. */
  confirmado: z.boolean().default(false),
});
