import type { NextConfig } from "next";

const OCR_ARCHIVOS = [
  "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*",
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/package.json",
  "./node_modules/tesseract.js-core/*-lstm*",
  "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*",
];

const nextConfig: NextConfig = {
  // Solo para simular en local el empaquetado de Vercel (copia únicamente los archivos trazados).
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // `firebase-admin` y `sharp` ya vienen excluidos del bundle por defecto en Next 16 (lista interna
  // de paquetes). `tesseract.js` no está en esa lista: se declara aquí para que Node lo cargue
  // con `require` normal (usa worker_threads y WASM, que el bundler rompe).
  serverExternalPackages: ["tesseract.js"],
  // Los datos de idioma se leen en tiempo de ejecución con una ruta calculada, así que el trazador
  // de archivos no los ve. Hay que incluirlos a mano en las funciones que hacen OCR (si no, en
  // Vercel faltan y tesseract intentaría descargarlos de internet).
  // tesseract.js lanza su worker en un hilo aparte que carga el núcleo WASM y varias dependencias con
  // require() dinámico: el trazador no las ve y, sin ellas, el hilo muere en silencio y la función se
  // cuelga hasta el 504 (así falló en Vercel). Solo se incluyen las variantes *-lstm del núcleo (OEM 1).
  outputFileTracingIncludes: {
    "/api/procesos/**": OCR_ARCHIVOS,
    "/api/salud": OCR_ARCHIVOS,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
