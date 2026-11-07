import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mismo alias que tsconfig.json ("@/*" → "src/*"): los módulos probados pueden importar con "@/…" como el resto del proyecto.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
