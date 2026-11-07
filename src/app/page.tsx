import { BorrarTodo } from "@/componentes/BorrarTodo";
import { ListaProcesos } from "@/componentes/ListaProcesos";
import { NuevoProceso } from "@/componentes/NuevoProceso";

export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Procesar facturas</h1>
        <p className="mt-2 text-texto2">
          Sube las imágenes: la app las lee con OCR, valida cada cifra, guarda los datos y genera un Excel por lote.
        </p>
      </header>
      <NuevoProceso />
      <ListaProcesos />
      <BorrarTodo />
    </main>
  );
}
