"use client";

// Cifras acumuladas de un conjunto de lotes mientras se procesan: antes de IVA, IVA, impoconsumo y total.
// Salen de los contadores de cada lote (se actualizan factura a factura), no de recorrer las facturas.

import { sumarMetricas } from "@/lib/procesamiento/metricas";
import type { LoteMetricas } from "./useMetricas";
import { cop, num } from "./formato";
import { Cifra } from "./ui";

export const procesadasDe = (l: LoteMetricas): number => {
  const m = l.metricas;
  return (m.aceptadas?.n ?? 0) + (m.revision?.n ?? 0) + (m.errores ?? 0) + (m.duplicadas ?? 0);
};

export function ResumenEnVivo({ lotes, titulo }: { lotes: LoteMetricas[]; titulo: string }) {
  const m = sumarMetricas(lotes.map((l) => l.metricas));
  const total = lotes.reduce((a, l) => a + l.totalArchivos, 0);
  const hechas = lotes.reduce((a, l) => a + procesadasDe(l), 0);
  // Las cifras suman las facturas aceptadas y las que quedaron en revisión (todo lo que se logró leer).
  const subtotal = m.aceptadas.subtotal + m.revision.subtotal;
  const iva = m.aceptadas.iva + m.revision.iva;
  const inc = m.aceptadas.impoconsumo + m.revision.impoconsumo;
  const tot = m.aceptadas.total + m.revision.total;
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{titulo}</h3>
        <span className="cifra text-sm text-texto2">
          {num(hechas)} de {num(total)} facturas procesadas · {num(m.aceptadas.n)} aceptadas · {num(m.revision.n + m.errores)} a revisión
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Antes de IVA" valor={cop(subtotal)} />
        <Cifra etiqueta="IVA" valor={cop(iva)} />
        <Cifra etiqueta="Impoconsumo" valor={cop(inc)} />
        <Cifra etiqueta="Total" valor={cop(tot)} />
      </div>
    </section>
  );
}
