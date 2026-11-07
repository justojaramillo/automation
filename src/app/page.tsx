import { BarraUsuario } from "@/componentes/BarraUsuario";
import { ListaProcesos } from "@/componentes/ListaProcesos";
import { NuevoProceso } from "@/componentes/NuevoProceso";

export default function Inicio() {
  return (
    <>
      <BarraUsuario />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Procesador de facturas</h1>
          <p className="mt-2 opacity-80">
            Elige una carpeta con imágenes de facturas: la app las sube, lee con OCR, valida, guarda en la base de datos y
            genera un Excel.
          </p>
        </header>
        <NuevoProceso />
        <ListaProcesos />
      </main>
    </>
  );
}
