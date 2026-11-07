import { Suspense } from "react";
import { BarraUsuario } from "@/componentes/BarraUsuario";
import { VistaProceso } from "@/componentes/VistaProceso";

export default function PaginaProceso({ params }: PageProps<"/procesos/[id]">) {
  return (
    <>
      <BarraUsuario />
      <Suspense fallback={<p className="px-6 py-6">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </>
  );
}

async function Contenido({ params }: { params: PageProps<"/procesos/[id]">["params"] }) {
  const { id } = await params;
  return <VistaProceso id={id} />;
}
