import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  outputFileTracingIncludes: {
    "/api/salud": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*"],
    "/api/procesos/**": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*"],
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
