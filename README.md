# Procesador de facturas

Aplicación web (Next.js 16, desplegada en Vercel) que automatiza el procesamiento de facturas electrónicas colombianas: eliges una carpeta de imágenes, la app las sube a **Vercel Blob**, las lee con **OCR** (tesseract.js), extrae y valida los campos (IVA, impoconsumo, dígito de verificación del NIT…), los guarda en **Firestore**, calcula **métricas** por lote y genera un **Excel** por lote. El acceso se controla con **Firebase Authentication**.

Proyecto de la clase *Tendencias en desarrollo de software* (tema: **automatización**).

## Para construirlo (estudiantes y su IA)

La guía paso a paso está en **[`AGENTS.md`](AGENTS.md)** (para cualquier agente de IA) y en **[`CLAUDE.md`](CLAUDE.md)** (para Claude Code); el contenido es el mismo. Empieza por la sección 1, «Cómo usar esta guía con tu IA». Las fases, en orden: 0 cuentas → 1 proyecto base → 2 modelo de datos → A autenticación → 4 extractor → 5 OCR en Vercel → 3 subida a Blob → 6 lotes y guardado → 7 Excel → 8 interfaz y métricas → D operación.

## Ejecutar en local

```bash
npm install
cp .env.example .env        # y rellénalo (la guía explica cada variable; nunca subas .env a Git)
npx tsx scripts/probar-conexion.ts   # debe imprimir Firestore OK, Auth OK, Blob OK
npm run dev                 # http://localhost:3000
```

Comprobaciones antes de cada commit: `npm run lint`, `npx tsc --noEmit`, `npm test`.

## Documentación

`AGENTS.md` y `CLAUDE.md` se **generan** con `npm run docs` a partir de `docs/fuente/` (no se editan a mano en este repositorio). `npm test` falla si no coinciden con su fuente o si mencionan un archivo, variable o comando que no existe.
