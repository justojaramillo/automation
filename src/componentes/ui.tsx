// Piezas visuales compartidas: tarjeta de cifra, medidor de proporción e iconos de estado.

import type { ReactNode } from "react";

export function IconoOk({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.2" />
      <path d="M6.2 10.4l2.5 2.5 5-5.4" />
    </svg>
  );
}

export function IconoMal({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.2" />
      <path d="M7 7l6 6M13 7l-6 6" />
    </svg>
  );
}

export function Girando({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 animate-spin ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M10 2a8 8 0 1 0 8 8" />
    </svg>
  );
}

/** Tarjeta con una cifra (el valor va en tinta de texto; el color solo acompaña como marca). */
export function Cifra({ etiqueta, valor, detalle, grande = false }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; grande?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie p-4">
      <span className="text-sm text-texto2">{etiqueta}</span>
      <span className={`cifra font-semibold leading-tight tracking-tight ${grande ? "text-3xl" : "text-2xl"}`}>{valor}</span>
      {detalle ? <span className="text-xs text-texto2">{detalle}</span> : null}
    </div>
  );
}

/** Medidor de una proporción (n de total). Siempre con icono y texto: el color nunca es lo único que dice algo. */
export function Medidor({
  etiqueta, porcentaje, n, total, tono,
}: { etiqueta: string; porcentaje: number | null; n: number; total: number; tono: "bueno" | "malo" }) {
  const color = tono === "bueno" ? "bg-bueno" : "bg-malo";
  const texto = tono === "bueno" ? "text-bueno" : "text-malo";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
      <div className="flex items-center gap-2 text-sm">
        {tono === "bueno" ? <IconoOk className={texto} /> : <IconoMal className={texto} />}
        <span className="font-medium">{etiqueta}</span>
      </div>
      <div className="cifra text-3xl font-semibold tracking-tight">{porcentaje === null ? "—" : `${porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`}</div>
      <div
        role="meter" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje ?? 0}
        className="h-2 w-full overflow-hidden rounded-full bg-pista"
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje ?? 0}%` }} />
      </div>
      <span className="text-xs text-texto2">
        {n.toLocaleString("es-CO")} de {total.toLocaleString("es-CO")} facturas
      </span>
    </div>
  );
}

/** Barra de progreso simple (acento). */
export function Progreso({ valor, max, etiqueta }: { valor: number; max: number; etiqueta: string }) {
  const p = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={max} aria-valuenow={valor} className="h-2 w-full overflow-hidden rounded-full bg-pista">
      <div className="h-full rounded-full bg-acento transition-[width] duration-300" style={{ width: `${p}%` }} />
    </div>
  );
}

export const boton = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40";
export const botonPrimario = `${boton} bg-acento text-acento-texto hover:opacity-90`;
export const botonSecundario = `${boton} border border-borde bg-superficie hover:bg-pista`;
