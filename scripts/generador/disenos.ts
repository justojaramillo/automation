// Las 4 plantillas HTML de la factura. Cada una usa fuentes, etiquetas y formatos
// distintos a propósito: el extractor de la Fase 4 no puede depender de un solo diseño.

import type { Factura, FormatoFecha, Persona } from "./datos";
import { IVA_TARIFA, INC_TARIFA } from "./datos";

export interface Render {
  html: string;
  ancho: number; // ancho de la página en píxeles CSS
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cop = (n: number): string => "$" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function fecha(iso: string, formato: FormatoFecha): string {
  const [a, m, d] = iso.split("-");
  if (formato === "iso") return iso;
  if (formato === "dmy") return `${d}/${m}/${a}`;
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

/** NIT con o sin puntos, según el diseño. */
function nit(p: Persona, conPuntos: boolean): string {
  const d = p.documento;
  return conPuntos ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}-${p.dv}` : `${d}-${p.dv}`;
}

const AVISO = "Representación gráfica de factura electrónica de venta. Documento sintético con datos ficticios para fines académicos.";

interface Etiquetas {
  sub: string;
  iva: string;
  inc: string;
  total: string;
}

function totales(f: Factura, e: Etiquetas, fila: (etiqueta: string, valor: string, fuerte?: boolean) => string): string {
  const pct = (t: number): string => `${Math.round(t * 100)}`;
  return [
    fila(e.sub, cop(f.subtotal)),
    fila(e.iva.replace("{p}", pct(IVA_TARIFA)), cop(f.iva)),
    f.esMovil ? fila(e.inc.replace("{p}", pct(INC_TARIFA)), cop(f.impoconsumo)) : "",
    fila(e.total, cop(f.total), true),
  ].join("");
}

// ── Diseño 0: clásico con tabla ─────────────────────────────────────────────
function clasico(f: Factura): Render {
  const ff = (iso: string): string => fecha(iso, f.formatoFecha);
  const filas = f.items
    .map(
      (it, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td class="desc">${esc(it.descripcion)}</td>
        <td class="n">${it.cantidad}</td>
        <td class="n">${cop(it.precioUnitario)}</td>
        <td class="n">${Math.round(it.tarifaIva * 100)}%</td>
        ${f.esMovil ? `<td class="n">${Math.round(it.tarifaInc * 100)}%</td>` : ""}
        <td class="n">${cop(it.subtotal)}</td>
      </tr>`,
    )
    .join("");
  const fila = (e: string, v: string, fuerte = false): string =>
    `<tr class="${fuerte ? "tot" : ""}"><td>${esc(e)}</td><td class="n">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#111;font:14px 'Ubuntu','DejaVu Sans',sans-serif}
    .pg{width:800px;box-sizing:border-box;padding:32px}
    .cab{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #222;padding-bottom:12px}
    .prov b{font-size:21px}
    .caja{border:2px solid #222;padding:8px 14px;text-align:center;height:max-content}
    .caja b{display:block;font-size:15px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:14px 0}
    table{border-collapse:collapse;width:100%}
    .items th{background:#e8e8e8;border:1px solid #444;padding:6px;font-size:13px}
    .items td{border:1px solid #888;padding:6px;vertical-align:top}
    td.desc{width:300px}.n{text-align:right;white-space:nowrap}.c{text-align:center}
    .tt{width:340px;margin:14px 0 0 auto}.tt td{padding:5px 8px;border-bottom:1px solid #bbb}
    .tt .tot td{font-weight:bold;font-size:17px;border-top:2px solid #222}
    .cufe{margin-top:18px;font:9px 'DejaVu Sans Mono',monospace;word-break:break-all;color:#333}
    .aviso{margin-top:8px;font-size:10px;color:#555}
  </style></head><body><div class="pg">
    <div class="cab">
      <div class="prov"><b>${esc(f.proveedor.nombre)}</b><br>NIT: ${nit(f.proveedor, true)}<br>${esc(f.proveedor.responsabilidad)}<br>${esc(f.proveedor.direccion)}, ${esc(f.proveedor.ciudad)}<br>Tel. ${f.proveedor.telefono}</div>
      <div class="caja"><b>FACTURA ELECTRÓNICA DE VENTA</b>No. ${f.numero}</div>
    </div>
    <div style="font-size:11px;margin-top:6px">Resolución DIAN No. ${f.proveedor.resolucion.numero} del ${ff(f.proveedor.resolucion.fecha)}. Prefijo ${f.proveedor.resolucion.prefijo}, rango del ${f.proveedor.resolucion.prefijo}-${String(f.proveedor.resolucion.desde).padStart(6, "0")} al ${f.proveedor.resolucion.prefijo}-${String(f.proveedor.resolucion.hasta).padStart(6, "0")}.</div>
    <div class="meta">
      <div><b>Fecha de emisión:</b> ${ff(f.fecha)} ${f.hora}</div><div><b>Fecha de vencimiento:</b> ${ff(f.fechaVencimiento)}</div>
      <div><b>Forma de pago:</b> ${f.formaPago}</div><div><b>Medio de pago:</b> ${f.medioPago}</div>
      <div><b>Adquirente:</b> ${esc(f.cliente.nombre)}</div><div><b>NIT/CC:</b> ${nit(f.cliente, true)}</div>
    </div>
    <table class="items"><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>Valor unitario</th><th>IVA</th>${f.esMovil ? "<th>INC</th>" : ""}<th>Valor total</th></tr>${filas}</table>
    <table class="tt">${totales(f, { sub: "Valor antes de IVA", iva: "IVA {p}%", inc: "Impoconsumo {p}%", total: "TOTAL A PAGAR" }, fila)}</table>
    <div class="cufe">CUFE: ${f.cufe}</div>
    <div class="aviso">${AVISO}</div>
  </div></body></html>`;
  return { html, ancho: 800 };
}

// ── Diseño 1: encabezado de color con texto blanco ──────────────────────────
const COLORES = ["#1f3a5f", "#0f766e", "#7f1d1d", "#4c1d95", "#14532d"];

function encabezadoColor(f: Factura): Render {
  const ff = (iso: string): string => fecha(iso, f.formatoFecha);
  const color = COLORES[Number(f.proveedor.documento) % COLORES.length];
  const filas = f.items
    .map(
      (it) => `<tr><td>${it.cantidad}</td><td class="desc">${esc(it.descripcion)}</td><td class="n">${cop(it.precioUnitario)}</td><td class="n">${cop(it.subtotal)}</td></tr>`,
    )
    .join("");
  const fila = (e: string, v: string, fuerte = false): string =>
    `<div class="f ${fuerte ? "tot" : ""}"><span>${esc(e)}</span><span>${v}</span></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#222;font:14px 'DejaVu Serif',serif}
    .pg{width:820px}
    .band{background:${color};color:#fff;padding:22px 30px;display:flex;justify-content:space-between;align-items:flex-end}
    .band h1{margin:0;font-size:24px;letter-spacing:.5px}
    .band .r{text-align:right;font-size:13px;line-height:1.5}
    .cuerpo{padding:20px 30px}
    .dos{display:flex;justify-content:space-between;gap:30px;margin-bottom:14px;line-height:1.55}
    .t{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:1px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;border-bottom:2px solid ${color};padding:6px 4px;font-size:12px}
    td{padding:7px 4px;border-bottom:1px solid #ddd;vertical-align:top}
    td.desc{width:330px}.n{text-align:right;white-space:nowrap}th.n{text-align:right}
    .tots{width:360px;margin:16px 0 0 auto}
    .f{display:flex;justify-content:space-between;padding:4px 0}
    .f.tot{border-top:2px solid ${color};margin-top:6px;padding-top:8px;font-weight:bold;font-size:18px;color:${color}}
    .cufe{margin-top:20px;font:9px 'DejaVu Sans Mono',monospace;word-break:break-all;color:#444}
    .aviso{margin-top:8px;font-size:10px;color:#666}
  </style></head><body><div class="pg">
    <div class="band"><div><h1>${esc(f.proveedor.nombre)}</h1><div>NIT ${nit(f.proveedor, false)} · ${esc(f.proveedor.responsabilidad)}</div></div>
      <div class="r">FACTURA ELECTRÓNICA<br><b style="font-size:20px">${f.numero}</b></div></div>
    <div class="cuerpo">
      <div class="dos">
        <div><div class="t">Cliente</div><b>${esc(f.cliente.nombre)}</b><br>Documento: ${nit(f.cliente, false)}</div>
        <div><div class="t">Datos de la factura</div>Emisión: ${ff(f.fecha)} - ${f.hora}<br>Vence: ${ff(f.fechaVencimiento)}<br>${f.formaPago} · ${f.medioPago}</div>
      </div>
      <div style="font-size:11px;color:#555;margin-bottom:10px">${esc(f.proveedor.direccion)}, ${esc(f.proveedor.ciudad)} · Resolución DIAN ${f.proveedor.resolucion.numero} de ${ff(f.proveedor.resolucion.fecha)} · Prefijo ${f.proveedor.resolucion.prefijo}</div>
      <table><tr><th>Cant.</th><th>Descripción</th><th class="n">Precio unitario</th><th class="n">Subtotal</th></tr>${filas}</table>
      <div class="tots">${totales(f, { sub: "Subtotal", iva: "IVA ({p}%)", inc: "Impuesto nacional al consumo ({p}%)", total: "Total factura" }, fila)}</div>
      <div class="cufe">CUFE ${f.cufe}</div>
      <div class="aviso">${AVISO}</div>
    </div>
  </div></body></html>`;
  return { html, ancho: 820 };
}

// ── Diseño 2: ticket angosto tipo POS ───────────────────────────────────────
function ticket(f: Factura): Render {
  const ff = (iso: string): string => fecha(iso, f.formatoFecha);
  const filas = f.items
    .map(
      (it) => `<div class="it"><div>${esc(it.descripcion)}</div><div class="l"><span>${it.cantidad} x ${cop(it.precioUnitario)}</span><span>${cop(it.subtotal)}</span></div></div>`,
    )
    .join("");
  const fila = (e: string, v: string, fuerte = false): string =>
    `<div class="l ${fuerte ? "tot" : ""}"><span>${esc(e)}</span><span>${v}</span></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#000;font:13px 'DejaVu Sans Mono',monospace}
    .pg{width:380px;box-sizing:border-box;padding:18px 16px}
    .c{text-align:center}.l{display:flex;justify-content:space-between;gap:8px}
    hr{border:0;border-top:1px dashed #000;margin:9px 0}
    .it{margin:6px 0}.tot{font-weight:bold;font-size:16px;margin-top:4px}
    .cufe{font-size:8px;word-break:break-all;margin-top:8px}.aviso{font-size:9px;margin-top:6px;text-align:center}
  </style></head><body><div class="pg">
    <div class="c"><b style="font-size:15px">${esc(f.proveedor.nombre.toUpperCase())}</b><br>NIT: ${nit(f.proveedor, false)}<br>${esc(f.proveedor.direccion)}<br>${esc(f.proveedor.ciudad)} Tel ${f.proveedor.telefono}<br>${esc(f.proveedor.responsabilidad)}</div>
    <hr>
    <div class="c"><b>FACTURA ELECTRONICA DE VENTA</b><br>No. ${f.numero}</div>
    <div>Res. DIAN ${f.proveedor.resolucion.numero}<br>${ff(f.proveedor.resolucion.fecha)} Pref. ${f.proveedor.resolucion.prefijo}</div>
    <hr>
    <div>Fecha: ${ff(f.fecha)} ${f.hora}<br>Vence: ${ff(f.fechaVencimiento)}<br>Pago: ${f.formaPago}<br>Medio: ${f.medioPago}</div>
    <hr>
    <div>CLIENTE: ${esc(f.cliente.nombre)}<br>NIT: ${nit(f.cliente, false)}</div>
    <hr>
    ${filas}
    <hr>
    ${totales(f, { sub: "SUBTOTAL", iva: "IVA {p}%", inc: "IMPOCONSUMO {p}%", total: "TOTAL" }, fila)}
    <hr>
    <div class="cufe">CUFE: ${f.cufe}</div>
    <div class="aviso">${AVISO}</div>
  </div></body></html>`;
  return { html, ancho: 380 };
}

// ── Diseño 3: caja con borde doble ──────────────────────────────────────────
function bordeDoble(f: Factura): Render {
  const ff = (iso: string): string => fecha(iso, f.formatoFecha);
  const filas = f.items
    .map(
      (it) => `<tr><td class="desc">${esc(it.descripcion)}</td><td class="n">${it.cantidad}</td><td class="n">${cop(it.precioUnitario)}</td><td class="n">${cop(it.subtotal)}</td></tr>`,
    )
    .join("");
  const fila = (e: string, v: string, fuerte = false): string =>
    `<tr class="${fuerte ? "tot" : ""}"><td>${esc(e)}</td><td class="n">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#1a1a1a;font:14px 'DejaVu Serif',serif}
    .pg{width:780px;box-sizing:border-box;padding:18px}
    .caja{border:6px double #222;padding:22px 26px}
    h1{margin:0;text-align:center;font-size:23px;letter-spacing:2px}
    .sub{text-align:center;margin:4px 0 14px;line-height:1.5}
    .num{text-align:center;font-size:18px;font-weight:bold;border-top:1px solid #222;border-bottom:1px solid #222;padding:6px;margin:10px 0}
    .dat{line-height:1.7;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    .it th{border-bottom:1px solid #222;text-align:left;padding:5px}.it td{padding:6px 5px;border-bottom:1px dotted #777;vertical-align:top}
    td.desc{width:320px}.n{text-align:right;white-space:nowrap}.it th.n{text-align:right}
    .tt{width:330px;margin:12px 0 0 auto}.tt td{padding:4px 6px}.tt .tot td{border-top:1px solid #222;font-weight:bold;font-size:17px}
    .cufe{margin-top:16px;font:9px 'DejaVu Sans Mono',monospace;word-break:break-all}.aviso{margin-top:6px;font-size:10px;text-align:center}
  </style></head><body><div class="pg"><div class="caja">
    <h1>${esc(f.proveedor.nombre.toUpperCase())}</h1>
    <div class="sub">NIT ${nit(f.proveedor, true)} · ${esc(f.proveedor.responsabilidad)}<br>${esc(f.proveedor.direccion)} - ${esc(f.proveedor.ciudad)} · Tel. ${f.proveedor.telefono}<br>Autorización de numeración DIAN ${f.proveedor.resolucion.numero} de ${ff(f.proveedor.resolucion.fecha)}</div>
    <div class="num">FACTURA DE VENTA ELECTRÓNICA N° ${f.numero}</div>
    <div class="dat">Señores: <b>${esc(f.cliente.nombre)}</b><br>NIT: ${nit(f.cliente, true)}<br>Fecha de expedición: ${ff(f.fecha)} a las ${f.hora}<br>Fecha límite de pago: ${ff(f.fechaVencimiento)} (${f.formaPago}, ${f.medioPago})</div>
    <table class="it"><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">V. unitario</th><th class="n">V. total</th></tr>${filas}</table>
    <table class="tt">${totales(f, { sub: "Base gravable", iva: "IVA {p} %", inc: "Imp. consumo {p} %", total: "VALOR TOTAL" }, fila)}</table>
    <div class="cufe">CUFE: ${f.cufe}</div>
    <div class="aviso">${AVISO}</div>
  </div></div></body></html>`;
  return { html, ancho: 780 };
}

const DISENOS: ReadonlyArray<(f: Factura) => Render> = [clasico, encabezadoColor, ticket, bordeDoble];
export const NOMBRES_DISENO = ["clasico", "encabezado-color", "ticket", "borde-doble"] as const;

export function renderizar(f: Factura): Render {
  return DISENOS[f.diseno](f);
}
