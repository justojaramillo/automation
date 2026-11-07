// Reglas de negocio: devuelve la lista de MOTIVOS de revisión (vacía = factura aceptable).

import { dvValido } from "./nit";
import { INC_TARIFA, IVA_TARIFA, TOLERANCIA_PESOS } from "./constantes";
import type { ParcialFactura } from "./tipos";

const cerca = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_PESOS;

export function validar(p: ParcialFactura): string[] {
  const m: string[] = [];

  // Campos obligatorios
  if (!p.numero) m.push("Falta el número de factura");
  if (!p.fecha) m.push("Falta la fecha de emisión");
  if (!p.proveedor) m.push("Falta el proveedor");
  else if (p.proveedor.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length < 6) m.push(`La razón social del proveedor parece ilegible: "${p.proveedor}"`);
  if (!p.nitProveedor) m.push("Falta el NIT del proveedor");
  if (!p.clienteDocumento) m.push("Falta el documento del cliente");
  if (p.subtotal === null) m.push("Falta el valor antes de IVA");
  if (p.iva === null) m.push("Falta el IVA");
  if (p.total === null) m.push("Falta el total");
  if (p.items.length === 0) m.push("No se leyó ningún ítem");

  // Dígito de verificación (detecta ~98 % de errores de un dígito; no es garantía)
  if (p.nitProveedor && p.dvProveedor !== null && !dvValido(p.nitProveedor, p.dvProveedor)) {
    m.push(`El NIT del proveedor ${p.nitProveedor}-${p.dvProveedor} no pasa el dígito de verificación`);
  }
  if (p.clienteDocumento && p.clienteDv !== null && !dvValido(p.clienteDocumento, p.clienteDv)) {
    m.push(`El documento del cliente ${p.clienteDocumento}-${p.clienteDv} no pasa el dígito de verificación`);
  }

  // Ítems
  for (const it of p.items) {
    if (it.cantidad * it.precioUnitario !== it.subtotal) {
      m.push(`Ítem "${it.descripcion}": ${it.cantidad} × ${it.precioUnitario} ≠ ${it.subtotal}`);
    }
  }
  if (p.items.length > 0 && p.subtotal !== null) {
    const suma = p.items.reduce((a, it) => a + it.subtotal, 0);
    if (suma !== p.subtotal) m.push(`Los ítems suman ${suma} y el valor antes de IVA es ${p.subtotal}`);
  }

  // Impuestos y total
  if (p.subtotal !== null && p.iva !== null && !cerca(p.iva, Math.round(p.subtotal * IVA_TARIFA))) {
    m.push(`El IVA ${p.iva} no es el ${IVA_TARIFA * 100} % de ${p.subtotal}`);
  }
  if (p.impoconsumo !== null && p.subtotal !== null && !cerca(p.impoconsumo, Math.round(p.subtotal * INC_TARIFA))) {
    m.push(`El impoconsumo ${p.impoconsumo} no es el ${INC_TARIFA * 100} % de ${p.subtotal}`);
  }
  if (p.impoconsumo === null && p.mencionaImpoconsumo && p.subtotal !== null && p.total !== null && p.iva !== null) {
    // Si el total cuadra sin impoconsumo, la palabra era solo una etiqueta; si no, falta leerlo.
    if (!cerca(p.subtotal + p.iva, p.total)) m.push("El texto menciona impoconsumo pero no se pudo leer su valor");
  }
  if (p.subtotal !== null && p.iva !== null && p.total !== null) {
    const esperado = p.subtotal + p.iva + (p.impoconsumo ?? 0);
    if (!cerca(esperado, p.total)) m.push(`Subtotal + IVA + impoconsumo = ${esperado} y el total es ${p.total}`);
  }
  return m;
}
