import { ListaRevision } from "@/componentes/ListaRevision";

export default function Revision() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Revisión de facturas</h1>
        <p className="mt-2 text-texto2">
          Las facturas que la máquina no pudo aceptar. Abre cada una, mira la imagen y completa o corrige los datos: con eso se cierra el ciclo de validación humana.
        </p>
      </header>
      <ListaRevision />
    </main>
  );
}
