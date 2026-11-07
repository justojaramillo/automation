import { PanelMetricas } from "@/componentes/PanelMetricas";

export default function Metricas() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Métricas</h1>
        <p className="mt-2 text-texto2">
          Cuánto se ha procesado (por razón social, antes de IVA, IVA e impoconsumo) y qué tan bien se leyeron las facturas, por lote o en total.
        </p>
      </header>
      <PanelMetricas />
    </main>
  );
}
