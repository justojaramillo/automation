// Dígito de verificación del NIT colombiano (algoritmo de la DIAN).
// Lo usan el generador de facturas (scripts/) y, en la Fase 4, el validador.
// Detecta ~98 % de los errores de un solo dígito; no es una garantía.

const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/** Calcula el DV de un documento (solo dígitos, sin puntos ni guion). */
export function calcularDv(documento: string): number {
  if (!/^\d{1,15}$/.test(documento)) {
    throw new Error(`Documento inválido para calcular el DV: "${documento}"`);
  }
  let suma = 0;
  // Los pesos se aplican de derecha a izquierda.
  for (let i = 0; i < documento.length; i++) {
    const digito = Number(documento[documento.length - 1 - i]);
    suma += digito * PESOS[i];
  }
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

/** `true` si el DV dado corresponde al documento. */
export function dvValido(documento: string, dv: number): boolean {
  if (!/^\d{1,15}$/.test(documento)) return false;
  return calcularDv(documento) === dv;
}
