export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Procesador de facturas</h1>
      <p className="text-lg leading-8 opacity-80">
        Elige una carpeta con imágenes de facturas; la app las sube, lee con OCR, valida y genera un
        Excel. Todavía estamos en la Fase 1: proyecto base y primer despliegue.
      </p>
      <p className="text-sm opacity-60">
        Comprobación del despliegue: <a className="underline" href="/api/salud">/api/salud</a>
      </p>
    </main>
  );
}
