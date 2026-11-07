# CLAUDE.md — Procesador de facturas (Next.js + OCR + Vercel Blob + Firebase + Excel) desplegado en Vercel

Eres Claude Code ayudando a un estudiante a construir **desde cero** este proyecto, por fases. Contexto: clase "Tendencias en desarrollo de software", tema **automatización**. El estudiante sabe TypeScript y Python. **El objetivo es que entienda lo que construye**: explica brevemente el porqué de cada paso y no avances de fase sin que la verificación pase.

Todo lo que sigue a esta cabecera (a partir de la sección 1) es **la misma guía paso a paso que contiene `AGENTS.md`** (la leen otros agentes de IA). Esta cabecera añade solo lo específico de Claude Code y el estado del repositorio de referencia.

## Cómo trabajar con Claude Code en este proyecto

- **Al empezar una fase**: usa el modo de plan (o resume tu plan en máximo 8 líneas), lista los archivos que vas a tocar y el comando que demuestra que terminó. Espera el visto bueno.
- **Lee y entiende cada petición de permiso** antes de aprobarla. No apruebes en bloque comandos que impriman o lean `.env`, que borren datos, que hagan `git push --force` o que creen recursos en la nube.
- **Si una acción es denegada** (por el estudiante o por el sistema de permisos), no la rodees por otro camino: busca una alternativa más segura y, si de verdad hace falta esa acción, explica por qué y deja que el estudiante decida. Un caso real: una prueba automática terminaba pulsando «Borrar todo» contra la base real y el sistema la bloqueó con razón; la solución fue limpiar solo lo que la prueba crea.
- **Entre fases**, limpia la conversación (`/clear`): esta guía y el repositorio ya contienen el contexto; no hace falta arrastrar historial.
- **No lances subagentes ni tareas largas en segundo plano sin que el estudiante lo pida**, y no dejes procesos corriendo al terminar.
- **Documentación primero**: para Next.js 16 lee `node_modules/next/dist/docs/` antes de escribir código (ver el detector de código desactualizado, sección 2).
- **Cómo mirar `.env` en una sesión nueva**: nunca lo leas ni lo imprimas. Comprueba que está completo con `npx tsx scripts/probar-conexion.ts`; si necesitas ver qué nombres hay, `grep -v '^#' .env | cut -d= -f1` (solo la parte anterior al primer `=`).

<!-- PROFESOR:INICIO — Esta sección es el estado del repositorio de referencia. Bórrala si entregas este archivo a los estudiantes. -->

## 0. Estado del repositorio de referencia (SOLO PROFESOR — léelo primero en una sesión nueva)

Repositorio: https://github.com/justojaramillo/automation (rama `main`). Producción: https://automation-six-chi.vercel.app (Vercel Hobby, `maxDuration` 300 s). Cuenta de prueba: `billing@me.com` (creada con `scripts/crear-usuario.ts`; la contraseña es débil: cambiarla antes de usar datos reales). Etiquetas de git: `fase-1`, `fase-2`, `fase-a`, `fase-4`, `fase-8` (el trabajo se subió en pocos commits, no uno por fase).

**Construido y verificado (2026-11-06/07):** todas las fases (0, 1, 2, A, 4, 5, 3, 6, 7, 8) y el generador (G). Fase D parcial: falta la nota de cuota completa y `npm run verificar` no existe (se usa `scripts/leer-carpeta.ts` para medir el extractor).

**Datos para los estudiantes:** `/home/justo/projects/facturas` (fuera del repositorio): **1000 imágenes** (600 png + 400 jpg, 108 MB, solo imágenes), generadas con `npm run generar:facturas -- --cantidad 1000 --semilla 2026 --salida ..` (850 clientes distintos, 150 repeticiones, 150 con impoconsumo, 250 por diseño, `FE-000001…FE-001000` únicos). Respuestas correctas: `salida/verdad_1000.json` (**SOLO PROFESOR**; el generador la deja en `../verdad.json` y se movió allí para que no viaje con la carpeta). Cuidado: el generador **borra** `<salida>/facturas`; con `--salida ..` borraría `../facturas`. Las 10 facturas de `salida/facturas` (semilla 2026, cantidad 10, con su `salida/verdad.json`) son solo de desarrollo y **no** forman parte de las 1000 (numeran desde `FE-000001`: mezclarlas duplicaría números).

**Mediciones del extractor** (offline, `scripts/leer-carpeta.ts`): 10/10 aceptadas (conjunto de desarrollo), 39/40 (semilla 777), 56/60 (semilla 31; era 82 % antes de arreglar la razón social partida con el título de la factura) y, **sobre las 1000 facturas de los estudiantes, 915 aceptadas (92 %) y 85 a revisión; de las aceptadas, 912 totalmente correctas y 3 con error no detectado** (17 min de CPU, sin cuota). Una muestra de 100 del mismo conjunto había dado 85 %: las muestras pequeñas engañan. Exactitud por campo sobre las 1000: número 996, fecha 996, NIT proveedor 987, documento cliente 973, subtotal 991, IVA 981, impoconsumo 997, total 993, nº de ítems 983. Motivos de revisión más comunes: documento del cliente no leído (21), proveedor no leído (11), ítems que no suman el subtotal (10), IVA que no es el 19 % (6).

**Medido en producción (Vercel Hobby):** 10 facturas en 14,7 s (3 lotes concurrentes de 4); 200 facturas en 2 lotes de 100 → ~7 min, 94/100 correctas en cada lote, 0 errores de consola; subida de 1000 imágenes (10 lotes) en 89 s con retraso máximo del navegador de 2 ms. **No se han procesado las 1000 completas en producción** (≈ 25–35 min, ≈ 5 000 lecturas y 6 000 escrituras de cuota).

**Decisiones del profesor:**
- Cuota: el plan gratuito de Firestore da 50 000 lecturas al día (dato del profesor; las escrituras y borrados diarios no se han confirmado). Pidió poder subir 1000 facturas, así que la interfaz no limita y muestra la estimación de lecturas.
- La clave privada de Firebase que se imprimió por error en una sesión anterior **no se rota por ahora** (proyecto de desarrollo, sin datos reales). No mencionarlo como pendiente; el profesor conoce el riesgo.
- Las contraseñas y claves **nunca** se escriben en este archivo ni en el repositorio.

**Pendiente:** (1) procesar las 1000 completas en producción y anotar la cuota gastada; (2) probar el botón «Borrar todo» contra la base real (una prueba automática no debe ejecutarlo; el sistema de seguridad lo bloqueó con razón) y la interfaz en un teléfono; (3) completar la Fase D (nota de cuota, política de blobs); (4) opcional: `npm run verificar` contra `verdad.json`.

**Mantenimiento de la documentación:** `AGENTS.md` y `CLAUDE.md` se generan con `npm run docs` desde `docs/fuente/` (cabeceras `cabecera-agents.md` y `cabecera-claude.md` + guía en `docs/fuente/guia/*.md`). Edita la fuente y regenera; `npm test` falla si los archivos no coinciden o si la guía menciona un archivo, variable o comando que ya no existe.

<!-- PROFESOR:FIN -->
