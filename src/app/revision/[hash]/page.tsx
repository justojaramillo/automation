import { Suspense } from "react";
import { FormularioFactura } from "@/componentes/FormularioFactura";

export default function PaginaRevision({ params }: PageProps<"/revision/[hash]">) {
  return (
    <Suspense fallback={<p className="px-6 py-6">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/revision/[hash]">["params"] }) {
  const { hash } = await params;
  // `key`: cada factura es un formulario NUEVO. Sin esto, React reutiliza el componente al pasar a la siguiente y
  // conservaría los campos y la confirmación de la anterior (se podrían guardar datos de una factura sobre otra).
  return <FormularioFactura key={hash} hash={hash} />;
}
