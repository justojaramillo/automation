// Extractor de datos de una factura colombiana a partir del texto del OCR.
// Funciones PURAS (sin OCR ni base de datos): se prueban con texto de ejemplo.

import type { ItemFactura } from "@/lib/modelo/tipos";
import { calcularDv } from "./nit";
import type { ParcialFactura } from "./tipos";

// ───────────────────────── Normalización del texto del OCR ─────────────────────────

/** Corrige los defectos típicos del OCR en cifras antes de interpretar. */
export function normalizarTexto(texto: string): string {
  let t = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  // `$496 .000` → `$496.000`
  t = t.replace(/(\$\s?\d{1,3}) +\.(\d{3})/g, "$1.$2");
  // `$ 496.000` → `$496.000`
  t = t.replace(/\$ +(\d)/g, "$$$1");
  // `S146.500` (la S es un $ mal leído) → `$146.500`
  t = t.replace(/(^|[\s|])S(\d{1,3}\.\d{3})/gm, "$1$$$2");
  // Cantidad, precio y subtotal pegados: `119426.500$4.691.500` → `11 $426.500 $4.691.500`.
  // Solo se acepta si cantidad × precio = subtotal (si no, es una cifra legítima).
  t = t.replace(/(\d{1,3})[9$S](\d{1,3}\.\d{3}) ?\$(\d{1,3}(?:\.\d{3})+)/g, (todo, q: string, p: string, s: string) =>
    Number(q) * aNumero(p) === aNumero(s) ? `${q} $${p} $${s}` : todo,
  );
  // `3$146.500` → `3 $146.500`
  t = t.replace(/(\d)\$/g, "$1 $");
  return t;
}

function aNumero(importe: string): number {
  return Number(importe.replace(/[$.\s,]/g, ""));
}

// ───────────────────────── Importes ─────────────────────────

/** Importes de una línea: `$1.234.567`, `$500` o `1.234.567` (con puntos de miles). Sin decimales. */
function importes(linea: string): number[] {
  const sinPorcentajes = linea.replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
  const encontrados = sinPorcentajes.match(/\$\s?\d+(?:\.\d{3})*|(?<![\d.])\d{1,3}(?:\.\d{3})+(?![\d.])/g) ?? [];
  return encontrados.map(aNumero);
}

// ───────────────────────── Fechas ─────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function iso(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  if (a < 2000 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface FechaHallada {
  iso: string;
  inicio: number;
  fin: number;
}

/** Todas las fechas del texto en los tres formatos: dd/mm/yyyy, yyyy-mm-dd y `12 de marzo de 2026`. */
function fechasEn(linea: string): FechaHallada[] {
  const res: FechaHallada[] = [];
  const patrones: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m) => iso(+m[3], +m[2], +m[1])],
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => iso(+m[1], +m[2], +m[3])],
    [
      /\b(\d{1,2}) de ([a-záéíóúñ]+) de (\d{4})\b/gi,
      (m) => {
        const mes = MESES.indexOf(m[2].toLowerCase());
        return mes < 0 ? null : iso(+m[3], mes + 1, +m[1]);
      },
    ],
  ];
  for (const [re, conv] of patrones) {
    for (const m of linea.matchAll(re)) {
      const valor = conv(m as RegExpExecArray);
      if (valor) res.push({ iso: valor, inicio: m.index!, fin: m.index! + m[0].length });
    }
  }
  return res.sort((a, b) => a.inicio - b.inicio);
}

const NO_ES_EMISION = /venc|l[ií]mite|resoluci|autorizaci|\bres\b|rango|pref/i;

/** Fecha de EMISIÓN: ignora vencimiento, fecha de la resolución DIAN y rango de numeración. */
export function extraerFecha(texto: string): string | null {
  const lineas = texto.split("\n");
  let sinEtiqueta: string | null = null;
  for (let i = 0; i < lineas.length; i++) {
    const hallazgos = fechasEn(lineas[i]);
    let desde = 0;
    for (const h of hallazgos) {
      const contexto = lineas[i].slice(desde, h.inicio);
      desde = h.fin;
      if (NO_ES_EMISION.test(contexto)) continue;
      if (/(emisi[oó]n|expedici[oó]n|fecha)\s*:?\s*$/i.test(contexto)) return h.iso;
      // Sin etiqueta propia: solo vale si ni la línea anterior habla de resolución.
      const anterior = i > 0 && !/\d/.test(contexto.trim()) ? lineas[i - 1] : "";
      if (sinEtiqueta === null && !NO_ES_EMISION.test(anterior)) sinEtiqueta = h.iso;
    }
  }
  return sinEtiqueta;
}

// ───────────────────────── Número, NIT y nombres ─────────────────────────

export function extraerNumero(texto: string): string | null {
  for (const linea of texto.split("\n")) {
    if (/rango|resoluci|autorizaci/i.test(linea)) continue; // ahí aparece FE-000001 … FE-050000
    const m = linea.match(/\b([A-Z]{1,5}-\d{3,10})\b/);
    if (m) return m[1];
  }
  return null;
}

interface DocumentoHallado {
  documento: string;
  dv: number;
  linea: number;
  contexto: string; // texto de esta línea y la anterior hasta el documento
  posicion: number;
}

/** Documentos con dígito de verificación: `900.123.456-7` o `900123456-7` (con \b: no es el CUFE ni la resolución). */
function documentosEn(lineas: string[]): DocumentoHallado[] {
  const res: DocumentoHallado[] = [];
  lineas.forEach((linea, i) => {
    // Contexto: las dos líneas anteriores (el nombre del cliente puede partirse y alejar la etiqueta del NIT).
    const previa = lineas.slice(Math.max(0, i - 2), i).join(" ");
    const agregar = (documento: string, dv: number, indice: number) =>
      res.push({ documento, dv, linea: i, contexto: `${previa} ${linea.slice(0, indice)}`, posicion: indice });
    for (const m of linea.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{3}){2}|\d{8,10})\s?-\s?(\d)(?!\d)/g)) {
      agregar(m[1].replace(/\./g, ""), Number(m[2]), m.index!);
    }
    // El OCR a veces pierde el guion ("8376231879"): solo se acepta si el último dígito ES un DV válido
    // del número anterior (si no, podría ser un teléfono o un fragmento de otra cifra).
    for (const m of linea.matchAll(/(?<![\d.$-])(\d{9})(\d)(?![\d.]|\s?-\s?\d)/g)) {
      if (calcularDv(m[1]) === Number(m[2]) && !res.some((r) => r.linea === i && r.posicion === m.index)) {
        agregar(m[1], Number(m[2]), m.index!);
      }
    }
  });
  return res.sort((a, b) => a.linea - b.linea || a.posicion - b.posicion);
}

const ETIQUETA_CLIENTE = /cliente|adquirente|se[ñn]ores|\bdocumento\b|nit\/cc/i;
const SUFIJO_EMPRESA = /(?:\bS\.?\s?A\.?\s?S\.?|\bS\.?\s?A\.?(?=\s|$)|\bLtda\.?|\bE\.?\s?U\.?(?=\s|$)|\bS\.\s?en\s?C\.?)$/i;

function limpiarEncabezado(linea: string): string {
  return linea
    .replace(/FACTURA\s+(DE\s+VENTA\s+)?ELECTR[OÓ]NICA(\s+DE(\s+VENTA)?)?/gi, " ")
    .replace(/\b(FACTURA|ELECTR[OÓ]NICA)\b/gi, " ") // a veces la razón social las separa en dos líneas
    .replace(/\s+VENTA\s*$/i, " ") // "…FACTURA ELECTRÓNICA DE / S.A.S. VENTA": el título se parte entre líneas
    .replace(/Responsable de IVA/gi, " ")
    .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, "")
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9.]+$/, "") // ruido del OCR al final ("==", "\"")
    .replace(/\s+/g, " ")
    .trim();
}

/** Razón social: la(s) línea(s) justo antes de la línea del NIT del proveedor (o en ella, antes de "NIT"). */
function extraerProveedor(lineas: string[], lineaNit: number): string | null {
  const antesDeNit = lineas[lineaNit].split(/\bNIT\b/i)[0];
  const candidatas = [antesDeNit, ...lineas.slice(0, lineaNit).reverse()].map(limpiarEncabezado);
  let i = 0;
  const util = (s: string) => s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length >= 2;
  while (i < candidatas.length && !util(candidatas[i])) i++;
  if (i >= candidatas.length) return null;
  const cortarEnSufijo = (n: string): string => {
    const m = n.match(/^(.*?(?:\bS\.?\s?A\.?\s?S\.?|\bLtda\.?|\bS\.?\s?A\.?(?=\s|$)|\bE\.?\s?U\.?(?=\s|$)))(?=\s|$)/i);
    return (m ? m[1] : n).trim();
  };
  const letras = (n: string): number => n.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length;
  let nombre = cortarEnSufijo(candidatas[i]);
  // Razón social partida en dos líneas: la segunda línea quedó solo con el sufijo ("LTDA.", "S.A.S.", a veces con
  // ruido del título detrás): se antepone la línea anterior.
  if (letras(nombre) <= 4 && SUFIJO_EMPRESA.test(nombre)) {
    let k = i + 1;
    while (k < candidatas.length && !util(candidatas[k])) k++;
    if (k < candidatas.length) nombre = cortarEnSufijo(`${candidatas[k]} ${nombre}`);
  }
  return nombre || null;
}

const plausibleComoTextoCliente = (l: string): boolean => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(l) && !/\bNIT\b/i.test(l);

function extraerNombreCliente(lineas: string[]): string | null {
  const corta = (s: string) =>
    s.split(/\s+(?:NIT|Documento|Emisi[oó]n|Fecha|CC)\b/i)[0].replace(/\s+/g, " ").trim();
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const m = l.match(/(?:Adquirente|Cliente|Se[ñn]ores)\s*:\s*(.+)/i);
    if (m && corta(m[1])) return corta(m[1]);
    // Diseño de encabezado de color: "CLIENTE   DATOS DE LA FACTURA" y el nombre en la línea siguiente.
    if (/^\s*CLIENTE\b/i.test(l) && /DATOS/i.test(l) && lineas[i + 1]) return corta(lineas[i + 1]) || null;
  }
  // Sin etiqueta de cliente legible: el nombre va en la línea anterior a "Documento: …".
  for (let i = 1; i < lineas.length; i++) {
    if (/^\s*Documento\b/i.test(lineas[i]) && plausibleComoTextoCliente(lineas[i - 1])) return corta(lineas[i - 1]) || null;
  }
  return null;
}

// ───────────────────────── Ítems ─────────────────────────

const LINEA_TOTAL = /^\s*(valor antes de iva|subtotal|base gravable|iva(?![a-zñáéíóú])|impoconsumo|imp\.? ?consumo|impuesto|total|valor total|neto|descuento)/i;
const ENCABEZADO_TABLA = /\b(cant|descripci[oó]n|precio|unitario|v\.\s?unitario|v\.\s?total)\b/i;
const NO_ES_DESCRIPCION =
  /\b(nit|tel|fecha|pago|medio|cliente|adquirente|se[ñn]ores|cufe|cute|resoluci|autorizaci|responsable|forma|vence|emisi|documento)\b|[|[\]_—]|factura|representaci/i;

function plausibleComoTexto(linea: string): boolean {
  const s = linea.replace(/\s/g, "");
  if (s.length < 3) return false;
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length;
  return letras / s.length >= 0.7 && !NO_ES_DESCRIPCION.test(linea) && !ENCABEZADO_TABLA.test(linea);
}

interface ItemParcial {
  linea: number;
  descripcion: string;
  cantidad: number | null;
  precio: number | null;
  subtotal: number | null;
}

function parsearLineaItem(linea: string, indice: number): ItemParcial | null {
  const montos = importes(linea);
  if (montos.length === 0) return null;
  // Se quitan los porcentajes de tarifa y el número de fila "1 |" que algunos diseños anteponen.
  const t = linea
    .replace(/\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/^\s*(?:\d{1,2}|[A-Za-z])\s*[|:\]]\s+/, "")
    .replace(/\|/g, " ");
  const primerMonto = t.search(/\$|(?<![\d.])\d{1,3}\.\d{3}/);
  const antes = t.slice(0, primerMonto).trim();
  // Candidatos de cantidad: el entero pegado al primer importe ("… 2 $116.500", "20 x $22.700") o el inicial.
  const final = antes.match(/(?:^|\s)(\d{1,4})(?:\s*[xX×])?$/);
  const inicial = antes.match(/^(\d{1,4})\s+(.+)/);
  const precio = montos[0];
  const sub = montos.length >= 2 ? montos[montos.length - 1] : null;
  const candidatos: { q: number; desc: string }[] = [];
  if (final) candidatos.push({ q: Number(final[1]), desc: antes.slice(0, antes.length - final[0].length).trim() });
  if (inicial) candidatos.push({ q: Number(inicial[1]), desc: inicial[2].trim() });

  const elegido = sub !== null ? candidatos.find((c) => c.q * precio === sub) : candidatos[0];
  let cantidad: number | null = elegido?.q ?? null;
  let descripcion = elegido?.desc ?? "";
  if (!elegido) {
    // Ningún candidato cuadra: por estructura, primero el pegado al importe, luego el inicial.
    const c = candidatos[0];
    cantidad = c ? c.q : null;
    descripcion = c ? c.desc : antes;
    if (sub !== null && precio > 0 && sub % precio === 0 && !c) cantidad = sub / precio;
  }
  descripcion = descripcion.replace(/\s*[xX×]$/, "").replace(/\s+/g, " ").trim();
  return { linea: indice, descripcion, cantidad, precio, subtotal: sub };
}

/** Reparación por redundancia aritmética: si cant×precio ≠ subtotal pero subtotal/precio es un entero pequeño, la cantidad se leyó mal. */
function repararCantidad(i: { cantidad: number; precioUnitario: number; subtotal: number }): void {
  if (i.cantidad * i.precioUnitario === i.subtotal || i.precioUnitario <= 0) return;
  const q = i.subtotal / i.precioUnitario;
  if (Number.isInteger(q) && q >= 1 && q <= 999) i.cantidad = q;
}

function extraerItems(lineas: string[], hasta: number): ItemFactura[] {
  const partes: ItemParcial[] = [];
  for (let i = 0; i < hasta; i++) {
    if (LINEA_TOTAL.test(lineas[i])) continue;
    const p = parsearLineaItem(lineas[i], i);
    const esOtraCosa = /\b(nit|tel|resoluci|autorizaci|cufe|rango|cra|carrera|calle|cl|kr|av|avenida|diagonal|transversal)\b/i;
    if (p && p.precio !== null && p.precio >= 100 && !esOtraCosa.test(lineas[i])) partes.push(p);
  }
  // Descripciones partidas en dos líneas: la parte sin cifras puede venir ANTES o DESPUÉS de los importes.
  const usadas = new Set<number>();
  for (let k = 0; k < partes.length; k++) {
    const p = partes[k];
    if (p.descripcion) continue;
    const previa = k > 0 ? partes[k - 1].linea : -1;
    const trozos: string[] = [];
    for (let j = p.linea - 1; j > previa && trozos.length < 2; j--) {
      if (usadas.has(j) || !plausibleComoTexto(lineas[j])) break;
      trozos.unshift(lineas[j].trim());
      usadas.add(j);
    }
    p.descripcion = trozos.join(" ");
  }
  partes.forEach((p, k) => {
    if (!p.descripcion) return;
    const limite = k + 1 < partes.length ? partes[k + 1].linea : hasta;
    const trozos: string[] = [];
    for (let j = p.linea + 1; j < limite; j++) {
      if (usadas.has(j)) break;
      if (!plausibleComoTexto(lineas[j])) break;
      trozos.push(lineas[j].trim());
      usadas.add(j);
    }
    if (trozos.length) p.descripcion = `${p.descripcion} ${trozos.join(" ")}`;
  });

  return partes
    .filter((p) => p.precio !== null && p.descripcion.length > 0)
    .map((p) => {
      const cantidad = p.cantidad ?? (p.subtotal && p.precio ? p.subtotal / p.precio : 1);
      const item = {
        descripcion: p.descripcion,
        cantidad,
        precioUnitario: p.precio!,
        subtotal: p.subtotal ?? cantidad * p.precio!,
      };
      repararCantidad(item);
      return item;
    });
}

// ───────────────────────── Totales ─────────────────────────

function ultimoImporteDe(lineas: string[], patron: RegExp, desde = 0): number | null {
  let valor: number | null = null;
  for (let i = desde; i < lineas.length; i++) {
    if (!patron.test(lineas[i])) continue;
    const m = importes(lineas[i]);
    if (m.length) valor = m[m.length - 1];
  }
  return valor;
}

// ───────────────────────── extraer ─────────────────────────

export function extraer(textoOcr: string): ParcialFactura {
  const texto = normalizarTexto(textoOcr);
  const lineas = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Documentos: el del cliente lleva una etiqueta (Cliente/Adquirente/Señores/Documento/NIT/CC); el del proveedor es el otro.
  const docs = documentosEn(lineas);
  const delCliente = docs.find((d) => ETIQUETA_CLIENTE.test(d.contexto)) ?? null;
  const delProveedor = docs.find((d) => d !== delCliente && (!delCliente || d.linea <= delCliente.linea)) ?? null;
  const proveedorHallado = delProveedor && delProveedor !== delCliente ? delProveedor : null;

  // Totales empiezan donde aparece la primera etiqueta de subtotal con importe.
  const primeraTotales = lineas.findIndex((l) => /^\s*(valor antes de iva|subtotal|base gravable)\b/i.test(l) && importes(l).length > 0);
  const inicioTotales = primeraTotales >= 0 ? primeraTotales : lineas.length;
  const zonaTotales = lineas.slice(inicioTotales);

  const subtotal = ultimoImporteDe(lineas, /^\s*(valor antes de iva|subtotal|base gravable)\b/i, inicioTotales);
  const iva = ultimoImporteDe(lineas, /^\s*iva(?![a-zñáéíóú])/i, inicioTotales);
  const impoconsumo = ultimoImporteDe(lineas, /impoconsumo|imp\.?\s?consumo|impuesto nacional al consumo|\binc\b/i, inicioTotales);
  const total = ultimoImporteDe(lineas, /^\s*(total a pagar|total factura|valor total|total)\b/i, inicioTotales);
  const mencionaImpoconsumo = zonaTotales.some((l) => /impoconsumo|imp\.?\s?consumo|\bconsumo\b/i.test(l));

  return {
    numero: extraerNumero(texto),
    fecha: extraerFecha(texto),
    proveedor: proveedorHallado ? extraerProveedor(lineas, proveedorHallado.linea) : null,
    nitProveedor: proveedorHallado?.documento ?? null,
    dvProveedor: proveedorHallado?.dv ?? null,
    clienteDocumento: delCliente?.documento ?? null,
    clienteDv: delCliente?.dv ?? null,
    clienteNombre: extraerNombreCliente(lineas),
    items: extraerItems(lineas, inicioTotales),
    subtotal,
    iva,
    impoconsumo,
    mencionaImpoconsumo,
    total,
  };
}
