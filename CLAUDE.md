# CLAUDE.md — Procesador de facturas (Next.js + OCR + Vercel Blob + Postgres + Excel) desplegado en Vercel

Eres la IA que ayuda a un estudiante a construir **desde cero** este proyecto, por fases.
Contexto: clase "Tendencias en desarrollo de software", tema **automatización**. El estudiante sabe TypeScript y Python.
El objetivo es que **entienda lo que construye**: explica brevemente el porqué de cada paso y no avances de fase sin que la verificación pase.

> **Cambio de arquitectura respecto a la versión anterior:** el proyecto ya no corre en el computador del usuario con XAMPP/MySQL y rutas del disco. Ahora se **despliega en Vercel**: las facturas se suben a **Vercel Blob**, los datos viven en **Postgres (Neon, desde el Marketplace de Vercel)** y el Excel se guarda en Blob. Esto cambia cómo se selecciona la carpeta, cómo corre el trabajo largo y dónde queda el Excel (ver sección 1 y las fases).

## 1. Qué hace el sistema

1. El usuario abre la app (desplegada en Vercel) y **elige una carpeta** de su computador con las imágenes de facturas (`.png` / `.jpg`) usando el selector de carpetas del navegador.
2. Pulsa **Procesar** y, de ahí en adelante, todo es automático:
   **subir** cada imagen a Vercel Blob → leerla con OCR → extraer campos → validar → guardar en **Postgres** → generar un **Excel**.
3. El Excel se guarda **en Vercel Blob** (bajo `procesos/<id>/`) y la interfaz ofrece el enlace de descarga. (Un servidor en la nube no puede escribir en el disco del usuario; por eso ya no existe "el Excel queda en la misma carpeta de las imágenes".)
4. La interfaz muestra el avance en vivo y un resumen final.

### Por qué el diseño cambia en Vercel (explícaselo al estudiante)

- **No hay un proceso que viva mucho tiempo.** Las funciones de Vercel son efímeras (Hobby: máx. 300 s por invocación; Pro: hasta 800 s). El gestor de trabajos en `globalThis` y el "segundo plano" de la versión local **no funcionan**. El avance se guarda en la base de datos y el trabajo se reparte en **lotes pequeños e idempotentes**.
- **Cuerpo de petición máximo 4,5 MB** en una función. Las imágenes no pueden pasar por nuestra API: el navegador las sube **directo a Blob** (client upload) con un token que emite nuestro servidor.
- **El sistema de archivos es de solo lectura** (salvo `/tmp`). Todo lo persistente va a Blob o a la base de datos.
- **1 vCPU en Hobby** (2 vCPU máximo en Pro). Un pool de `worker_threads` no acelera nada en una sola vCPU; el paralelismo se logra con **varias invocaciones concurrentes** de la función.

### Datos del ejercicio (criterio de aceptación)

- La carpeta del curso contiene **1000 facturas** de **850 clientes distintos**: 850 clientes aparecen una vez y **150 facturas son de clientes que ya existen** (repetidos).
- Al terminar el procesamiento de la carpeta completa:
  - `facturas` debe tener **1000 filas** (las dudosas quedan con `estado = 'revision'`, no se pierden).
  - `clientes` debe tener **850 filas**, sin duplicados ni clientes inventados por errores del OCR.
  - Reprocesar la misma carpeta **no debe duplicar nada** (idempotencia), aunque las imágenes se suban otra vez a Blob con otra ruta.
- Referencia de una prueba previa con 100 facturas (OCR + extracción + validaciones, con SQLite): 88 % aceptadas automáticamente, 12 % a revisión, 76 % totalmente correctas (87 % si solo se cuentan cifras, fechas y NIT). Con 1000 facturas y el campo nuevo de documento del cliente los números pueden variar: **mídelos, no los supongas**.

## 2. Reglas de trabajo para ti (la IA)

- **Trabaja por fases (sección 5).** Al terminar cada fase: ejecuta la verificación de la fase, muestra el resultado, haz un commit, súbelo a GitHub (Vercel despliega solo) y **detente** hasta que el estudiante diga que continúe.
- **Nunca inventes credenciales ni asumas valores de conexión.** Los valores los inyecta Vercel (`vercel env pull`); ver Fase 0.
- **Nunca escribas secretos en el código ni en Git.** Solo en variables de entorno de Vercel y en `.env.local` (ignorado por Git, verifícalo con `git check-ignore`). Mantén un `.env.example` con los **nombres** de las variables y valores falsos.
- **No uses de memoria APIs de versiones nuevas.** Antes de escribir código con Next.js, Prisma, `@vercel/blob`, tesseract.js o exceljs, comprueba la versión instalada (`npm ls <paquete>`) y lee su documentación oficial o los tipos en `node_modules`. Tu conocimiento puede estar desactualizado. Para Next.js, lee `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Los límites de Vercel cambian**: antes de decidir tamaños de lote, duración o tamaño de bundle, consulta https://vercel.com/docs/functions/limitations y https://vercel.com/docs/vercel-blob/usage-and-pricing.
- Instala versiones **exactas y actuales** (`npm view <paquete> version`). Fija Prisma en la serie 7 (`prisma@7`, `@prisma/client@7`): el tag `latest` puede apuntar a una versión candidata de la 8.
- Si algo del documento no funciona como se describe, **dilo claramente** y explica qué cambiaste. No lo escondas.
- TypeScript en modo estricto, sin `any` salvo justificación comentada.
- Convenciones: variables y funciones en `camelCase`, tipos y componentes en `PascalCase`, tablas y columnas en `snake_case` (con `@map` / `@@map` en Prisma), textos de la interfaz en español.
- Un commit por fase con mensaje claro (`fase-3: subida de carpeta a Blob`). Etiqueta `fase-N` al terminar.

### Detector de código desactualizado (Next.js 16)

Si vas a escribir algo de esta lista, para y revisa la documentación:
`middleware.ts` ahora es **`proxy.ts`**; `params` y `searchParams` son **`Promise`** (hay que hacer `await`); las rutas dinámicas de Route Handlers reciben `RouteContext`; no uses `getServerSideProps`/`pages/`; `next lint` ya no existe (usa ESLint directo); paquetes nativos o WASM del servidor se declaran en `serverExternalPackages`. El proyecto actual usa `cacheComponents: true`: las rutas de API y las lecturas de base de datos deben ser dinámicas (revisa cómo afecta esa opción antes de escribir páginas que lean la base de datos).

## 3. Pila tecnológica

| Pieza | Elección | Nota |
|---|---|---|
| Hosting | **Vercel** (proyecto enlazado al repositorio de GitHub) | Cada `git push` despliega. Fluid compute activo (por defecto). |
| Framework | Next.js (la versión ya instalada en el repo, 16.x), App Router, TypeScript estricto | Route Handlers como API. |
| Archivos | **Vercel Blob**, store **privado** (`@vercel/blob`) | Las facturas contienen datos de clientes: store privado, lectura solo desde nuestras funciones. Subida desde el navegador con `upload()` de `@vercel/blob/client` y una ruta `handleUpload`. El acceso (privado/público) **no se puede cambiar** después de crear el store. |
| Base de datos | **Postgres de Neon** instalado desde el **Marketplace de Vercel** | "Vercel Postgres" como producto propio ya no existe; Neon es la opción integrada. Vercel inyecta las variables de conexión en el proyecto. |
| ORM | Prisma 7 con driver adapter de Postgres (`@prisma/adapter-pg` o `@prisma/adapter-neon`) | Lee la guía oficial de Prisma 7 + Neon antes de elegir. Prisma 7 usa `prisma.config.ts` y un cliente generado en carpeta propia. Hay que ejecutar `prisma generate` en el build de Vercel (script `postinstall` o `build`). |
| OCR | `tesseract.js` 7 + `@tesseract.js-data/spa` | WASM puro. Los datos de idioma vienen del paquete npm, con `langPath` local; hay que **incluirlos en el bundle de la función** con `outputFileTracingIncludes`. |
| Imagen | `sharp` | Preprocesado de reintento. Binarios nativos: `serverExternalPackages`. |
| Validación | `zod` 4 | Esquemas y reglas de negocio. |
| Excel | `exceljs` | Celdas numéricas reales (no texto) con formato de moneda. Se genera en memoria (Buffer) y se sube a Blob. |
| Pruebas | `vitest` | Pruebas unitarias del extractor y los validadores. |
| Solo para el profesor (Fase G) | `@faker-js/faker`, `playwright`, `sharp` | Generador de facturas sintéticas. Los estudiantes **no** lo ejecutan. |

### OCR en Vercel (sin pool propio de workers)

`tesseract.js` ya usa `worker_threads` internamente en Node. Con 1 vCPU, nuestro pool de `worker_threads` no aporta. En su lugar:

- Un módulo `src/lib/ocr/motor.ts` crea **un** worker de tesseract (idioma `spa`, `langPath` local, sin descargas de red) y lo **reutiliza entre invocaciones** de la misma instancia caliente (guardado en `globalThis`).
- Cada invocación de `POST /api/procesos/[id]/lote` procesa un **lote pequeño** (tamaño a medir; punto de partida 6–10 imágenes, siempre muy por debajo de `maxDuration`) y responde.
- El paralelismo lo da el **cliente**, que lanza 3–4 llamadas de lote concurrentes (Vercel crea una instancia por cada una).
- Si se comprueba que el worker no carga bajo el bundler de Next/Vercel, usa `workers/ocr-worker.mjs` (JS plano, solo OCR, `new Worker(path.resolve(process.cwd(), "workers/ocr-worker.mjs"))`) y **documenta por qué**. El análisis del texto y la escritura en la base de datos siempre van en TypeScript fuera del worker.

## 4. Lo que NO está verificado (compruébalo y repórtalo)

La lógica de OCR, extracción y validación sí se probó con 100 facturas. Lo siguiente **no se ha probado** en conjunto y puede fallar; si falla, explica el motivo y la corrección:

- Next.js 16 (con `cacheComponents`) + tesseract.js + `sharp` **dentro de una función de Vercel**: rutas de WASM y `langPath`, tamaño del bundle (límite 250 MB sin comprimir), arranque en frío.
- Prisma 7 + driver adapter de Postgres contra Neon desde funciones serverless (conexiones: usa la cadena **agrupada/pooled** en runtime y la **sin agrupar** para `db push`).
- Subida directa a Blob con `upload()` de ~1000 archivos (~90 MB): concurrencia del navegador, reintentos, límites del plan.
- El reclamo de lotes concurrentes sin procesar dos veces el mismo archivo (`FOR UPDATE SKIP LOCKED`).
- El tiempo con 1000 imágenes en 1 vCPU por invocación: **mídelo** (no hay estimación fiable; puede ser claramente mayor que los 4–12 min de la prueba local con varios núcleos).
- Costos/cuotas del plan Hobby (Blob, CPU activa, Neon): consúltalos y repórtalos con números, no los supongas.

## 5. Fases

### Fase 0 — Cuentas y conexiones (PREGUNTAR, no asumir)

Esta fase es obligatoria y va **antes de escribir cualquier código de base de datos o de Blob**. El estudiante debe crear sus recursos; tú lo guías.

1. Pregúntale, uno por uno, y espera su respuesta:
   - URL del repositorio de GitHub y si ya tiene el proyecto de Vercel creado/enlazado.
   - Plan de Vercel (Hobby o Pro): determina `maxDuration` (300 s / 800 s) y la CPU (1 vCPU / hasta 2).
   - Región de las funciones (sugerencia: la más cercana al estudiante; el store de Blob y la base de datos deben quedar **en la misma región** o cercanas).
2. Guíalo para: importar el repo en Vercel (Git integration) → **Storage / Marketplace → Neon (Postgres)** → **Storage → Blob, store privado** → conectar ambos al proyecto en los entornos Development, Preview y Production.
3. Trae las variables al equipo local con `vercel link` y `vercel env pull .env.local`. **No inventes ni escribas valores a mano**. Comprueba (sin imprimir secretos) qué nombres de variable aparecieron (p. ej. `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`: confirma los nombres reales) y documéntalos en `.env.example`. `BLOB_READ_WRITE_TOKEN` hace falta para emitir tokens de subida desde el navegador.
4. Verifica que `.env*` esté en `.gitignore` **antes** de que existan los archivos con secretos.
5. Escribe `scripts/probar-conexion.ts` que ejecute `SELECT 1` contra Postgres y liste el store de Blob (`list({ limit: 1 })`) e imprima éxito o el error de cada uno. **No continúes hasta que funcione.**

Problemas conocidos para explicar si falla: variables no conectadas al entorno correcto; usar la URL agrupada para `db push` (o al revés); contraseña con caracteres especiales sin codificar; token de Blob ausente en local; la base de datos "dormida" de Neon que tarda unos segundos en la primera conexión.

Verificación: `npx tsx scripts/probar-conexion.ts` imprime "Postgres OK" y "Blob OK".

### Fase 1 — Proyecto base y primer despliegue

- El repo ya contiene el proyecto creado con `create-next-app` (Next 16, App Router, TypeScript, ESLint, Tailwind). **Revisa lo que ya hay** antes de añadir nada.
- Quita dependencias de fuentes de Google (`next/font/google`) si existen.
- Estructura sugerida:
  ```
  src/app/                    páginas y Route Handlers
  src/lib/db.ts               cliente Prisma (singleton en globalThis para evitar duplicados con HMR)
  src/lib/blob.ts             utilidades de Blob (rutas, lectura de un archivo)
  src/lib/ocr/                motor tesseract, extractor, validadores, tipos
  src/lib/procesamiento/      lotes, reclamo de archivos, finalización
  src/lib/excel/              generador del Excel
  scripts/                    probar-conexion, verificar, generar-facturas (profesor)
  ```
- Configura `serverExternalPackages` (`tesseract.js`, `sharp`) y `outputFileTracingIncludes` para los datos de idioma de `@tesseract.js-data/spa`.
- Añade `prisma generate` al flujo de build.
- Haz el **primer despliegue ahora** (push a GitHub) aunque la página sea trivial: así los problemas de despliegue aparecen pronto y no al final.

Verificación: `npm run dev` abre la página inicial; `npm run build` termina sin errores; el despliegue de Vercel queda en verde y la URL abre la página.

### Fase 2 — Modelo de datos

Con Prisma (usa `prisma db push` en clase contra la URL **sin agrupar**; explica que en producción se usarían migraciones). Considera crear una *branch* de Neon para desarrollo si el estudiante la quiere, para no mezclar datos de pruebas con producción.

Tablas mínimas (nombres en `snake_case` con `@@map`):

- `clientes`: `id`, **`documento` único** (NIT sin puntos ni guion, sin dígito de verificación), `dv`, `nombre`, `creado_en`.
- `facturas`: `id`, **`numero` único**, `fecha`, `proveedor` (razón social), `nit_proveedor`, `cliente_id` (nullable: si el documento no se pudo leer, queda en revisión), `subtotal` (valor antes de IVA), `iva`, `impoconsumo` (0 si no aplica), `total` (enteros en COP), `estado` (`aceptada` | `revision`), `motivos` (texto), `archivo` (nombre original), `blob_pathname` (ruta de la imagen en Blob), `hash_archivo` (SHA-256, **único**), `confianza_ocr`, `proceso_id`.
- `items_factura`: `id`, `factura_id`, `descripcion`, `cantidad`, `precio_unitario`, `subtotal`.
- `procesos`: `id`, `carpeta` (solo el nombre que mostró el navegador), `estado` (`en_cola` | `subiendo` | `ejecutando` | `terminado` | `error`), `total_archivos`, `procesados`, `aceptadas`, `en_revision`, `duplicadas`, `clientes_nuevos`, `clientes_existentes`, `inicio`, `fin`, `ruta_excel` (pathname en Blob).
- **`archivos`** (la cola de trabajo, nueva): `id`, `proceso_id`, `blob_pathname` (único por proceso), `nombre`, `estado` (`pendiente` | `procesando` | `ok` | `error`), `intentos`, `reclamado_en`, `error`.

Los importes de COP son enteros: usa `Int` (o `BigInt` si lo justificas), nunca `Float`.

Verificación: las tablas existen en el panel de Neon (o con `prisma studio`); `scripts/probar-conexion.ts` puede contar filas de `clientes`.

### Fase 3 — Selección y subida de la carpeta a Blob

El navegador no entrega rutas reales del disco, y ahora el servidor ni siquiera está en el computador del usuario. Por eso:

- La interfaz usa `<input type="file" webkitdirectory multiple>` para elegir la carpeta. Filtra en el cliente `.png/.jpg/.jpeg` y muestra el conteo ("1000 imágenes encontradas") y el tamaño total. Campo opcional **"procesar solo las primeras N"** para probar rápido con 20–50 facturas.
- `POST /api/procesos` crea el registro en `procesos` (estado `subiendo`) y devuelve el `id`.
- `POST /api/blob/subir` es la ruta `handleUpload` que **emite tokens de subida**. Debe validar: que exista un proceso en estado `subiendo`, que la ruta empiece por `procesos/<id>/`, que el tipo sea imagen PNG/JPG y un tamaño máximo razonable. Lee la documentación vigente de `@vercel/blob` para la forma exacta. No dependas de `onUploadCompleted` (no se dispara en local sin túnel): al terminar las subidas, el servidor lista el prefijo con `list()`.
- El cliente sube con `upload()` de `@vercel/blob/client`, con concurrencia limitada (≈6), barra de progreso y reintentos por archivo.
- Esto reemplaza al antiguo explorador de carpetas del servidor: **desaparece el riesgo de recorrer el disco del servidor** (explica el cambio de modelo de seguridad), pero aparece otro: cualquiera con la URL podría gastar cuota de Blob/CPU. Ver "Protección de acceso" en la Fase D.

Verificación: elegir la carpeta, subir 20 imágenes y ver en el panel de Blob los 20 archivos bajo `procesos/<id>/`.

### Fase 4 — Extractor de datos (lógica pura, con pruebas)

Función pura `extraer(textoOcr): ParcialFactura` y `validar(parcial): string[]` (lista de motivos de revisión). Sin OCR ni base de datos, para poder probarla con texto de ejemplo. Campos: número (`FE-000123`), fecha de **emisión** (tres formatos: `dd/mm/yyyy`, `yyyy-mm-dd`, `12 de marzo de 2026`, normalizada a `yyyy-mm-dd`), proveedor (razón social), NIT del proveedor, **documento y nombre del cliente**, ítems, subtotal (valor antes de IVA), IVA, **impoconsumo** (opcional) y total.

Contexto tributario colombiano que debes entender y explicar al estudiante:

- Una factura electrónica de venta trae: razón social y NIT con DV del emisor, adquirente (razón social y NIT/CC), número con prefijo, resolución de numeración DIAN, fecha y hora de emisión, forma y medio de pago, ítems, valor antes de IVA, IVA, total y **CUFE** (hash SHA-384 de 96 caracteres hexadecimales).
- **IVA** general: 19 %. **Impuesto nacional al consumo (INC, "impoconsumo")**: 4 % sobre telefonía móvil, datos e internet móvil; se liquida sobre el valor **sin IVA** y convive con el IVA, así que en esas facturas `total = subtotal + IVA + impoconsumo`. Matiz: para datos/internet móvil la base del 4 % es lo que exceda 1,5 UVT mensuales (concepto DIAN 828 de 2024); el generador lo simplifica aplicando el 4 % a todo el servicio. Verifica las tarifas vigentes con un contador y mantenlas como constantes parametrizadas.
- La factura trae **otras fechas y cifras largas que no son los campos buscados**: fecha de vencimiento, fecha de la resolución DIAN, número de resolución (14 dígitos), rango de numeración y el CUFE. El extractor debe tomar la fecha de **emisión** y no confundir esas cifras con NIT, número de factura o importes.
- Las etiquetas varían por diseño: "Valor antes de IVA" / "Subtotal" / "SUBTOTAL" / "Base gravable"; "IVA 19%" / "IVA (19%)" / "IVA 19 %"; "Impoconsumo 4%" / "Impuesto nacional al consumo (4%)" / "Imp. consumo 4 %"; "TOTAL A PAGAR" / "Total factura" / "TOTAL" / "VALOR TOTAL". El NIT aparece con o sin puntos (`900.123.456-7` o `900123456-7`).

Lecciones de la prueba previa que **debes** incorporar:

- Normaliza el texto del OCR antes de interpretar: `$496 .000` → `$496.000`; `3$146.500` → `3 $146.500`; cantidad y precio pegados (`119426.500$4.691.500` → `11 $426.500 $4.691.500`).
- Los importes usan punto de miles (`$1.234.567`), sin decimales.
- Una descripción puede **partirse en dos líneas**, y la parte sin cifras puede venir **antes o después** de la línea con los importes.
- El proveedor puede aparecer en la misma línea que la palabra `FACTURA`: corta en `S.A.S.`.
- Cuidado con falsos positivos de palabras (por ejemplo, "Mo**nit**or" contiene "nit"): usa límites de palabra (`\b`).
- **Reparación por redundancia aritmética**: si `cantidad × precio ≠ subtotal` pero `subtotal / precio` es un entero pequeño, el OCR leyó mal la cantidad; corrígela.
- Validaciones de negocio: ítems suman el subtotal; `cantidad × precio = subtotal`; IVA = 19 % del subtotal (tolerancia de $1); si hay impoconsumo, = 4 % del subtotal (tolerancia de $1); `subtotal + IVA + impoconsumo = total`; campos obligatorios presentes. Si el texto menciona "impoconsumo"/"consumo" pero no se pudo leer su valor, es motivo de revisión.
- **Dígito de verificación del NIT** (algoritmo de la DIAN): se aplican los pesos `3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71` a los dígitos desde la derecha; `r = suma mod 11`; `dv = r > 1 ? 11 − r : r`. Comprobado: 890903938 → 8, 860034313 → 7, 899999068 → 1. Úsalo para **validar el documento del cliente y el NIT del proveedor**. Detecta cerca del 98 % de los errores de un dígito, no todos: no lo presentes como garantía.
- **El cliente se identifica por documento, nunca por nombre** (el OCR altera los nombres). Si el documento no pasa el dígito de verificación, la factura queda en `revision` y **no se crea ningún cliente**.

Pruebas con Vitest usando como casos reales los errores de arriba (texto de ejemplo con cada defecto) y casos válidos de cada diseño de factura.

Verificación: `npm test` pasa; las pruebas incluyen al menos un caso por cada lección anterior.

### Fase 5 — OCR dentro de una función de Vercel

- `src/lib/ocr/motor.ts`: crea el worker de tesseract.js con idioma `spa` desde `@tesseract.js-data/spa/4.0.0_best_int` (comprueba la ruta real instalada), `langPath` local, `cachePath` en `/tmp` y **sin descargas de red**. Lo reutiliza entre invocaciones (`globalThis`). Expone `leerImagen(buffer, modo): { texto, confianza }`. La imagen se obtiene de Blob (descarga en memoria con el SDK), no del disco.
- `modo = "preprocesado"` (reintento): con `sharp`, escala de grises, `normalize`, ampliación 1,5× y `sharpen`. Un segundo reintento sobre la franja superior (30 %) **invertida** recupera encabezados de texto blanco sobre fondo de color (proveedor y NIT).
- Estrategia: leer la imagen original; si `validar` devuelve motivos, reintentar en modo preprocesado y quedarse con el resultado que tenga menos motivos. Lo que siga fallando queda en `revision`.
- Presupuesto de tiempo: cada lote comprueba el tiempo transcurrido y deja de reclamar más imágenes cuando se acerca a un margen seguro de `maxDuration` (configura `export const maxDuration` en la ruta).

Verificación: una ruta o script de prueba procesa 20 facturas **ya subidas a Blob**, ejecutándose **en el despliegue de Vercel (preview)** y no solo en local; imprime el tiempo total, el tiempo por imagen, el arranque en frío y los campos extraídos. Si solo funciona en local, la fase no está terminada.

### Fase 6 — Procesamiento por lotes, guardado en base de datos y avance

El estado vive en Postgres, no en memoria. Flujo:

1. `POST /api/procesos/[id]/iniciar`: lista el prefijo `procesos/<id>/` en Blob, inserta una fila en `archivos` por imagen (estado `pendiente`, `ON CONFLICT DO NOTHING`), fija `total_archivos` (respetando `limite`) y pasa el proceso a `ejecutando`. Responde de inmediato.
2. `POST /api/procesos/[id]/lote`: **reclama** atómicamente hasta N archivos pendientes con SQL crudo: `UPDATE archivos SET estado='procesando', reclamado_en=now() WHERE id IN (SELECT id FROM archivos WHERE proceso_id=$1 AND (estado='pendiente' OR (estado='procesando' AND reclamado_en < now() - interval '5 minutes')) ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING *`. Así dos invocaciones concurrentes nunca toman el mismo archivo, y los que quedaron "procesando" por una función caída se recuperan. Procesa cada archivo (OCR → extraer → validar) y lo guarda. Responde con el avance.
3. El **cliente** (la página) ejecuta un bucle con 3–4 llamadas a `/lote` concurrentes hasta que no quedan pendientes. Si el usuario cierra la pestaña, al volver a abrir el proceso el bucle **continúa** donde quedó (todo es idempotente). Cron/Vercel Workflow quedan como mejora opcional para no depender del navegador abierto.
4. `GET /api/procesos/[id]` devuelve el avance (`procesados / total`, aceptadas, en revisión, duplicadas, clientes nuevos/existentes, tiempo). La página consulta cada segundo. SSE es una mejora opcional.
5. Cuando no quedan pendientes ni procesando, `POST /api/procesos/[id]/finalizar` (idempotente) cierra el proceso y dispara la Fase 7.

Por cada factura, en **una transacción**: calcula `hash_archivo`; si ya existe (mismo `numero` o mismo hash), **omite** y cuéntala como duplicada; si el documento del cliente es válido, haz `upsert` del cliente por `documento` (no sobrescribas el nombre de un cliente ya existente); inserta factura e ítems; marca el `archivo` como `ok`.

Un error en una imagen **no detiene el lote**: se registra en `archivos.error`, se reintenta hasta un máximo de intentos y, si sigue fallando, la factura queda en `revision` con el motivo.

Verificación: procesar 50 facturas dos veces (subiéndolas dos veces) deja el mismo conteo en `facturas` y `clientes`; forzar el corte de una invocación a mitad de lote y reanudar no duplica nada.

### Fase 7 — Excel en Blob

Al finalizar el proceso, genera con `exceljs` **a partir de la base de datos** (no de la memoria) un archivo en memoria y súbelo a Blob en `procesos/<id>/resultado_AAAA-MM-DD_HHmm.xlsx` (hora de Colombia, con fecha y hora para no pisar ejecuciones anteriores):

- Hojas:
  - **Facturas**: archivo, número, fecha, proveedor, NIT proveedor, documento cliente, cliente, subtotal (valor antes de IVA), IVA, impoconsumo, total, estado, motivos, confianza OCR.
  - **Ítems**: número de factura, descripción, cantidad, precio unitario, subtotal.
  - **Clientes**: documento, nombre, número de facturas, total comprado.
  - **Resumen**: total de archivos, aceptadas, en revisión, clientes nuevos y existentes, duración.
- Importes como **números** con formato `"$"#,##0`; fechas como fechas; encabezados con filtro automático y fila fija.
- Guarda el pathname en `procesos.ruta_excel`. Como el store es privado, expón `GET /api/procesos/[id]/excel`, que lee el blob con el SDK y lo devuelve como descarga. La interfaz muestra "Excel disponible: descargar".
- Cuida memoria y tiempo con 1000 filas (modo normal de `exceljs` es suficiente; no necesitas *streaming* a este tamaño, pero compruébalo).

Verificación: descargar el Excel desde la interfaz; la suma de la columna `total` coincide con la consulta SQL.

### Fase 8 — Interfaz y verificación final

- Página principal: estado de las conexiones (Postgres y Blob), selector de carpeta, botón **Procesar**, barras de subida y de procesamiento.
- Página de resultados: tabla de facturas con filtro por `estado`, enlace al Excel y a la imagen original (servida por una ruta nuestra desde el Blob privado).
- Opcional (mejora): **cola de revisión manual**, donde el usuario corrige una factura en `revision` y la aprueba.
- `npm run verificar -- <ruta de verdad.json>`: compara la base de datos con el archivo de respuestas correctas (si el profesor lo entrega) e imprime: facturas y clientes en base de datos, exactitud por campo, aceptadas con error no detectado, **clientes que no existen en la verdad** (deben ser 0) y si se cumplen 1000 facturas / 850 clientes.

Verificación final **en la URL de producción de Vercel** con la carpeta completa: 1000 facturas, 850 clientes, Excel generado y descargable, reprocesar no duplica.

### Fase D — Despliegue y operación en Vercel

Se trabaja en paralelo con las demás fases (primer despliegue en la Fase 1), pero esta lista debe estar completa al final:

- Variables de entorno definidas en Production, Preview y Development; ningún secreto en el repo (`git log -p` sin secretos).
- `maxDuration` configurado en las rutas de lote y finalización según el plan; tamaño de lote y concurrencia justificados con las mediciones de la Fase 5.
- **Autenticación (decisión pendiente, depende de la base de datos):** Vercel **no trae un producto propio de login de usuarios**. Opciones: **Clerk** (integración nativa del Marketplace de Vercel), **Better Auth** (autoalojado, guarda usuarios en nuestra propia base de datos; encaja con Neon/Postgres, correo y contraseña habilitados), **Auth0**, o **Firebase Authentication** si la base de datos pasa a Firebase (correo y contraseña de serie). Antes de implementar, comprueba en la documentación vigente qué soporta cada una. Todas las rutas de la API (`/api/procesos/*`, `/api/blob/subir`, descargas) deben exigir sesión y **cada proceso pertenece a un usuario**, porque los endpoints gastan cuota de Blob, base de datos y CPU. La protección de despliegue de Vercel protege el acceso a los despliegues (equipo), no sirve como login de usuarios finales. Como mínimo provisional: contraseña compartida `ACCESS_PASSWORD` comprobada en `proxy.ts`.
- Los blobs de producción se borran o se conservan según una política explícita (p. ej. borrar las imágenes de procesos antiguos); decide con el estudiante y documéntalo.
- Registro de errores: revisa los *runtime logs* de Vercel tras la corrida completa y reporta cualquier 504, 413 o error de conexión a la base de datos.

Verificación: la corrida completa en producción sin errores en los logs, y una nota con el uso de cuota (Blob, CPU activa, Neon) que dejó.

### Fase G — Generador de facturas (SOLO PROFESOR; los estudiantes reciben un zip)

**Estado: implementado** en `scripts/generar-facturas.ts` (+ `scripts/generador/datos.ts` y `disenos.ts`). Uso: `npm run generar:facturas -- --cantidad 10 --semilla 2026 --salida salida`. Por defecto genera **10** facturas para ir probando; para el ejercicio completo se usa `--cantidad 1000`. Las proporciones (850/1000 clientes distintos, 60/30/10 de calidad, ~15 % móviles) se escalan con la cantidad.

- **Cero tokens:** todo es determinista (`@faker-js/faker` con semilla fija + HTML renderizado con `playwright` + degradación con `sharp`). **No se usa ningún LLM** para generar facturas. (El `.env` local tiene una `DEEPSEEK_API_KEY`: el generador no la usa; si algún día se usa, que sea como mejora opcional de extracción para facturas en `revision`, nunca para generar datos.)
- Crea primero un **pool de clientes únicos** (documento de 9 dígitos con **dígito de verificación válido**, usando `src/lib/ocr/nit.ts`) y asigna las facturas restantes a clientes ya usados; un cliente repetido conserva **exactamente el mismo documento y nombre**. Mezcla el orden final.
- Cada factura incluye: proveedor (razón social ficticia, NIT con DV válido, dirección, responsabilidad de IVA, resolución DIAN), número único `FE-000001…` sin relación con el nombre del archivo, fecha y hora de emisión, fecha de vencimiento, forma y medio de pago, **documento y nombre del cliente**, 1–6 ítems, **valor antes de IVA, IVA 19 %, impoconsumo 4 % (solo facturas de telefonía móvil)**, total y un CUFE simulado (SHA-384 con la estructura de la DIAN y clave técnica ficticia: no es verificable). Cada imagen lleva el aviso "documento sintético con datos ficticios para fines académicos".
- **4 diseños** (clásico con tabla, encabezado de color con texto blanco, ticket POS angosto, caja con borde doble), con fuentes, etiquetas de totales, formatos de NIT y de fecha distintos. Hay descripciones largas que se parten en dos líneas y una descripción con "Monitor" (falso positivo de "nit").
- Calidad por cuotas: limpia (PNG), media (rotación leve, desenfoque, JPEG 70) y mala (65 % de resolución, rotación, desenfoque, JPEG ~38).
- Salida: `salida/facturas/` con **solo las imágenes** (`factura_0001.png|jpg` …) y `salida/verdad.json` (datos correctos de cada factura, incluidos ítems, diseño y calidad) **fuera** de esa carpeta. `salida/` está en `.gitignore`.
- Al terminar el script **comprueba y falla (exit 1)** si: el número de imágenes no coincide, hay números repetidos, `subtotal + IVA + INC ≠ total`, el impoconsumo no es coherente con "móvil" o algún DV es inválido. Imprime imágenes, clientes distintos, repeticiones, móviles, diseños, calidad y tamaño.
- Para el zip del curso: `--cantidad 1000` y revisar que el tamaño del zip sea del orden de 90 MB (**no medido todavía**: con 10 facturas ocupan ~1 MB).

Verificación: el resumen se imprime con las comprobaciones en OK y se revisan a ojo 4 imágenes (una por diseño) — hecho con 10 facturas.

## 6. Cuando termines todo

Entrega al estudiante: qué hace cada carpeta, cómo ejecutar en local (`vercel env pull .env.local` y `npm run dev`), cómo desplegar, cómo correr las pruebas, qué resultados obtuvo con la carpeta completa en la URL de producción (con números reales: tiempos, cuota usada, exactitud) y **qué no pudiste verificar**.
