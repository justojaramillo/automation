# CLAUDE.md — Procesador de facturas (Next.js + OCR + Vercel Blob + Firebase + Excel) desplegado en Vercel

Eres la IA que ayuda a un estudiante a construir **desde cero** este proyecto, por fases.
Contexto: clase "Tendencias en desarrollo de software", tema **automatización**. El estudiante sabe TypeScript y Python.
El objetivo es que **entienda lo que construye**: explica brevemente el porqué de cada paso y no avances de fase sin que la verificación pase.

> **Cambio de arquitectura respecto a la versión anterior:** el proyecto ya no corre en el computador del usuario con XAMPP/MySQL y rutas del disco. Ahora se **despliega en Vercel**: las facturas se suben a **Vercel Blob**, los datos viven en **Firestore (Firebase)**, los usuarios se autentican con **Firebase Authentication (correo y contraseña)** y el Excel se guarda en Blob. Esto cambia cómo se selecciona la carpeta, cómo corre el trabajo largo y dónde queda el Excel (ver sección 1 y las fases).

## 0. Estado actual y punto de reanudación (léelo primero en una sesión nueva)

Última actualización: 2026-11-06. Repositorio: https://github.com/justojaramillo/automation (rama `main`).

**Hecho y verificado**
- Fase G (generador): `npm run generar:facturas -- --cantidad 10` produce 10 facturas colombianas (IVA 19 %, impoconsumo 4 % en móvil, 4 diseños, 3 calidades) y `salida/verdad.json`. Se revisaron a ojo 4 imágenes.
- `src/lib/ocr/nit.ts` (dígito de verificación) con pruebas: `npm test` pasa (6 de 6).
- Fase 0: `.env` con Firebase (web y Admin) y Vercel Blob; `npx tsx scripts/probar-conexion.ts` imprime Firestore OK, Auth OK y Blob OK. Las reglas de Firestore están cerradas (peticiones anónimas devuelven 403).
- `src/lib/firebase/admin.ts` (Firestore y Auth, solo servidor) y `.env.example`.
- `CLAUDE.md` migrado a Firebase (modelo de colecciones en la Fase 2, autenticación en la Fase A).

**Decisión de cuota (del estudiante)**: el plan gratuito de Firestore permite **50 000 lecturas por día** (dato dado por el estudiante; las escrituras diarias del plan gratuito no se han confirmado, verifícalas). Por eso **trabajamos con pocas facturas (10–50)** y **no se procesan las 1000 completas** hasta planificarlo (esperar al día siguiente, o plan Blaze). Una corrida de 1000 ≈ 5 000 lecturas y ≈ 6 000 escrituras; el borrado total y las limpiezas de prueba gastan además el límite diario de borrados. Reglas derivadas:
- (Actualizado 2026-11-07) El estudiante pidió poder subir 1000 facturas: la interfaz ya no limita; divide la selección en lotes (100 por defecto) y muestra la estimación de lecturas (~5 por factura).
- Presupuesto aproximado por factura: ~4–5 lecturas (hash, índice de número, cliente, reclamo del archivo) y ~5 escrituras. 50 facturas ≈ 250 lecturas: no es el problema.
- **El mayor riesgo de lecturas es el sondeo del avance**: cada consulta `count()` cuesta como mínimo 1 lectura. Consultar 5 conteos cada segundo son ~300 lecturas por minuto. Por eso: sondeo cada 3–5 s, **una sola** respuesta con todos los conteos, detener el sondeo cuando el proceso termina o la pestaña está oculta, y mostrar el contador de lecturas estimadas en los scripts de verificación.
- El Excel y `verificar` leen todas las facturas del proceso (N lecturas): contarlas en el presupuesto.
- Reprocesar la misma carpeta vuelve a gastar lecturas (el hash evita duplicar datos, no consumo): documenta cuántas se gastaron en cada prueba.

**Avance (2026-11-06, misma sesión)**: construidas las fases 1, 2, A, 4 y el código de las fases 3, 5, 6, 7 y 8. Resumen técnico:
- Fase 1: `src/app`, alias `@/*` → `src/*`, `serverExternalPackages: ["tesseract.js"]` (`firebase-admin` y `sharp` ya vienen excluidos por defecto en Next 16), `outputFileTracingIncludes` para los datos de `@tesseract.js-data/spa/4.0.0_best_int`, `engines.node = 24.x`. Con `cacheComponents`, `export const dynamic` no existe (usar `await connection()`); `maxDuration` sí funciona. Verificado en Vercel (`/api/salud`: datos de tesseract y `sharp` OK).
- Fase 2: tipos en `src/lib/modelo/tipos.ts`; `npx tsx scripts/verificar-reglas.ts` confirma reglas cerradas (403 anónimo).
- Fase A: `src/lib/auth/sesion.ts` (`exigirUsuario`), `/api/sesion`, `/login`, `src/proxy.ts`. **Requiere `USUARIOS_PERMITIDOS`** (correos separados por comas) en `.env` y en Vercel; sin ella nadie entra. Verificado: sin cookie las rutas dan 401 y `/` redirige a `/login`. **Falta probar el login real** (necesita el usuario de prueba).
- Fase 4: extractor/validador puros en `src/lib/ocr/` con 43 pruebas. Medido con 40 facturas de otra semilla: 39 aceptadas, 0 errores no detectados (`scripts/leer-carpeta.ts`).
- Fases 3/5/6/7/8: subida directa a Blob (`/api/blob/subir`), cola con arrendamiento (`cola.ts`), lote (`lote.ts`), guardado transaccional (`guardar.ts`), avance con `count()`, Excel (`src/lib/excel/generar.ts`), páginas `/` y `/procesos/[id]`. Prueba de extremo a extremo del servidor contra Firestore/Blob reales (`scripts/probar-pipeline.ts`): 10/10 guardadas, 9 clientes, suma del Excel = `sum()` de Firestore = verdad, reproceso con otra ruta: 10/10 duplicadas sin duplicar nada (4,5 s: el hash se mira antes del OCR).
- **Problema real en Vercel (resuelto)**: `firebase-admin@14.5.0` trae `jwks-rsa@4` → `jose@6` (solo-ESM) y en las funciones de Vercel `require()` de ese módulo falla con `ERR_REQUIRE_ESM` (en local con Node 24 sí funciona, por eso no se vio antes): TODAS las rutas que importaban `firebase-admin/auth` daban 500 en producción. Solución: `overrides` en `package.json` que fuerza `jwks-rsa@3.2.2` (usa `jose@4`, dual CJS/ESM) dentro de `firebase-admin`. Revisar si se puede quitar cuando `firebase-admin` actualice. Verificado en producción: Firestore, Blob, exceljs y tesseract.js cargan; rutas de API dan 401 sin sesión. Lección: probar importaciones en el despliegue, no solo en local.
- Desviación respecto al texto original: si el NÚMERO de una factura ya existe pero el archivo es distinto (hash distinto), no se descarta como duplicada: se guarda en `revision` con el motivo (podría ser un error del OCR y descartarla perdería una factura). Solo el mismo hash es `duplicada`.
- Índices: no se necesita ninguno compuesto en el flujo. (Un `sum()` filtrado por `procesoId` sí lo pediría; el script de prueba suma sobre toda la colección.)

**Interfaz y lotes (2026-11-07)**: menú superior «Procesar facturas» / «Métricas».
- **Lote = un proceso**: una selección grande se divide en lotes (por defecto de 100; cada uno con su proceso, su Excel y sus métricas). Mientras se sube el siguiente, el **motor** (`src/componentes/Motor.tsx`, en el layout) procesa los anteriores con 3 llamadas `/lote` concurrentes; sigue al cambiar de pestaña y, al abrir cualquier página, retoma los lotes `ejecutando` (idempotente). Un archivo que falla al subir se reintenta 3 veces y queda en una lista para reintentarlo; no detiene el resto.
- **Métricas**: contadores en `procesos/{id}.metricas` actualizados con `FieldValue.increment` DENTRO de la transacción de cada factura (`metricas.ts`, `metricas-firestore.ts`): aceptadas/revisión con antes de IVA, IVA, impoconsumo y total, errores, duplicadas, clientes nuevos y desglose por NIT de proveedor (solo facturas aceptadas). Abrir el panel cuesta 1 lectura por lote (no recorre facturas) y las cifras se ven en vivo durante la carga. «Leída correctamente» = pasó todas las validaciones (no se compara contra una respuesta conocida); «mal leída» = revisión + error; las duplicadas no cuentan en los porcentajes. `scripts/recalcular-metricas.ts <idLote>` reconstruye las métricas de un lote anterior a los contadores.
- **Borrar todo** (`/api/datos/borrar`, botón en «Procesar facturas»): borra TODO (de todos los usuarios: facturas, clientes, índices, lotes y Blob), pide escribir BORRAR y se niega con lotes en ejecución salvo confirmación extra. **No se probó contra la base real** (el clasificador de seguridad bloqueó ejecutarlo y es correcto: es un borrado total); solo se verificó el diálogo y la validación. Lo prueba el estudiante.
- Pruebas de interfaz con navegador real: `scripts/probar-ui.ts` (login → carpeta → lotes → métricas → detalle; limpia SOLO los lotes que creó con `scripts/limpiar-lotes.ts`).
- **Medido en producción (Vercel Hobby)**: 200 facturas en 2 lotes de 100 → 7 min, 94/100 correctas en cada lote, 0 errores de consola. Subida de 1000 imágenes (108,7 MB; la estimación previa de ~90 MB era baja) en 10 lotes: 89 s, con retraso máximo del navegador de 2 ms (no se bloquea). **NO se procesaron las 1000 completas** (≈ 25–35 min y ≈ 5 000 lecturas / 6 000 escrituras de cuota): solo la subida y la creación de la cola, con el OCR bloqueado a propósito.
- **Extractor, medición con 60 facturas de otra semilla**: 93 % aceptadas (56/60), 1 error NO detectado (un número de factura mal leído que la aritmética no puede ver). Antes de arreglar la razón social partida con el título («…FACTURA ELECTRÓNICA DE / S.A.S. VENTA») era 82 %: esa falla no apareció en las 50 facturas anteriores. Moraleja: medir siempre con semillas nuevas.
- Dato de prueba a recordar: dos corridas del generador con semillas distintas numeran ambas `FE-000001…`; al mezclarlas, las facturas con número repetido (hash distinto) quedan en `revision` con «ya existe en otra factura». Es el comportamiento diseñado, no un fallo.

**Pendiente**
1. ~~Login y Fase 5 en Vercel~~ **verificado en producción (2026-11-06)** con `scripts/probar-http.ts` y las 10 facturas: login 200, subida directa a Blob, rechazo de rutas/tipos no permitidos, 10/10 aceptadas, 9 clientes nuevos + 1 existente, Excel de 4 hojas, imagen servida, 401 sin cookie. **Medido en Vercel Hobby (3 lotes concurrentes, lotes de 4): 14,7 s para 10 facturas (1,5 s/factura efectivo), 2,7 s medio por archivo (máx 3,6 s)**; en un arranque en frío el primer lote tardó 9 s. Extrapolación NO medida: 1000 facturas ≈ 25 min con esa concurrencia.
   - Cuenta de prueba `billing@me.com` (script `scripts/crear-usuario.ts`); `USUARIOS_PERMITIDOS` ya está en `.env` y en Vercel (en el panel de Vercel las comillas no se quitan solas: el código las tolera). La contraseña de prueba es débil: cambiarla antes de usar datos reales.
   - **Dos fallos reales de empaquetado en Vercel, resueltos**: (a) `/lote` daba 504 porque el worker de tesseract (hilo aparte, `require` dinámico) no encontraba `tesseract.js-core` ni sus dependencias: el trazador no las ve → `outputFileTracingIncludes` incluye `tesseract.js`, TODO `tesseract.js-core` (el núcleo elegido depende de la CPU: relaxedsimd/simd/base, con o sin lstm; excluir variantes dio `Cannot find module`) y sus dependencias (paquete simulado de 113 MB, límite 250 MB); (b) el hilo muere en silencio, así que `motor.ts` pone topes de tiempo (60 s) para que falle con mensaje claro en vez de agotar los 300 s. Para simular el empaquetado de Vercel en local: `NEXT_STANDALONE=1 npm run build` y correr `.next/standalone/server.js` (copia solo los archivos trazados; ojo: en local eligió otra variante del núcleo, así que NO detecta todo; la prueba definitiva es el despliegue).
   - Por qué existe `USUARIOS_PERMITIDOS` aunque se use Firebase Auth: la `apiKey` es pública y el registro libre de Firebase está ABIERTO (comprobado el 2026-11-06: se creó una cuenta con solo la apiKey y se borró). La lista es autorización (quién puede usar la app); Firebase Auth sigue siendo la autenticación (la contraseña nunca está en variables). Alternativa: desactivar el registro en la consola de Firebase (puede requerir Identity Platform; verificar).
2. Fase D (nota de cuota, política de borrado de blobs, revisión de logs) y `npm run verificar` (Fase 8) aún no están hechas.
3. Corrida completa de 1000 facturas procesadas: NO hecha (solo se midió la subida). Probar el botón «Borrar todo» y la interfaz en el navegador de los estudiantes (móvil incluido) tampoco está hecho.

URL de producción: https://automation-six-chi.vercel.app (plan Hobby, `maxDuration` 300 s).

**Decisión del estudiante (2026-11-06)**: la clave privada de Firebase que se imprimió por error **no se rota por ahora** (proyecto de desarrollo, sin datos reales). No volver a mencionarlo como pendiente; el estudiante conoce el riesgo.

**Cómo trabajar con `.env` en sesiones nuevas**: no lo leas, ni lo imprimas, ni lo "resumas" con `cat`, `awk`, `sed` ni `grep` que muestre valores. Para comprobar que está completo usa `npx tsx scripts/probar-conexion.ts`; si necesitas ver qué nombres hay, muestra solo la parte anterior al primer `=` de las líneas que no son comentarios y **solo si el valor no se imprime** (por ejemplo `grep -v '^#' .env | cut -d= -f1`).

## 1. Qué hace el sistema

1. El usuario abre la app (desplegada en Vercel) y **elige una carpeta** de su computador con las imágenes de facturas (`.png` / `.jpg`) usando el selector de carpetas del navegador.
2. Pulsa **Procesar** y, de ahí en adelante, todo es automático:
   **subir** cada imagen a Vercel Blob → leerla con OCR → extraer campos → validar → guardar en **Firestore** → generar un **Excel**.
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
- **Nunca escribas secretos en el código ni en Git.** Solo en variables de entorno de Vercel y en `.env` (ignorado por Git, verifícalo con `git check-ignore`). **Nunca imprimas el contenido de `.env`** (ni con `cat`, ni con `awk`, ni en logs): para inspeccionarlo muestra solo nombres y longitudes. La clave privada de Firebase solo se usa en el servidor y jamás lleva el prefijo `NEXT_PUBLIC_`. Mantén un `.env.example` con los **nombres** de las variables y valores falsos.
- **No uses de memoria APIs de versiones nuevas.** Antes de escribir código con Next.js, `firebase-admin`, `firebase`, `@vercel/blob`, tesseract.js o exceljs, comprueba la versión instalada (`npm ls <paquete>`) y lee su documentación oficial o los tipos en `node_modules`. Tu conocimiento puede estar desactualizado. Para Next.js, lee `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Los límites de Vercel cambian**: antes de decidir tamaños de lote, duración o tamaño de bundle, consulta https://vercel.com/docs/functions/limitations y https://vercel.com/docs/vercel-blob/usage-and-pricing.
- Instala versiones **exactas y actuales** (`npm view <paquete> version`). Comprueba que `vitest`, `firebase-admin` y `@types/node` sean compatibles entre sí (hubo un conflicto de pares con `@types/node@20`; el proyecto usa la serie 24, igual que Node).
- Si algo del documento no funciona como se describe, **dilo claramente** y explica qué cambiaste. No lo escondas.
- TypeScript en modo estricto, sin `any` salvo justificación comentada.
- Convenciones: variables y funciones en `camelCase`, tipos y componentes en `PascalCase`, colecciones de Firestore en `snake_case` en plural (`clientes`, `facturas`, `indices_numero`, `procesos`) y campos en `camelCase`, textos de la interfaz en español.
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
| Base de datos | **Cloud Firestore** (proyecto de Firebase), acceso **solo desde el servidor** con `firebase-admin` | NoSQL de documentos. La cuenta de servicio se salta las reglas de seguridad, así que las **reglas de Firestore deben quedar en "denegar todo"**: ningún navegador accede directo a los datos. Los enteros de JavaScript se guardan como enteros de 64 bits (los pesos COP no pierden precisión). |
| Autenticación | **Firebase Authentication** con correo y contraseña | Inicio de sesión en el navegador con `firebase/auth`; el servidor intercambia el ID token por una **cookie de sesión** (`createSessionCookie`) y la verifica en cada ruta de API con `verifySessionCookie`. |
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
- `firebase-admin` + Next.js 16 dentro de funciones de Vercel (¿necesita `serverExternalPackages`?, arranque en frío, la clave privada con `\n` en variables de entorno de Vercel).
- Subida directa a Blob con `upload()` de ~1000 archivos (~90 MB): concurrencia del navegador, reintentos, límites del plan.
- El reclamo de lotes concurrentes sin procesar dos veces el mismo archivo (transacción de Firestore con consulta; comportamiento bajo contención).
- El tiempo con 1000 imágenes en 1 vCPU por invocación: **mídelo** (no hay estimación fiable; puede ser claramente mayor que los 4–12 min de la prueba local con varios núcleos).
- Costos/cuotas del plan Hobby de Vercel (Blob, CPU activa) y del plan gratuito de Firestore (recuerdo límites diarios de lecturas, escrituras y borrados del orden de decenas de miles, pero **verifícalo en la documentación vigente**): repórtalos con números medidos, no los supongas. Una corrida de 1000 facturas hace varios miles de lecturas y escrituras; varias corridas de prueba el mismo día pueden agotar la cuota diaria.

## 5. Fases

### Fase 0 — Cuentas y conexiones (PREGUNTAR, no asumir)

**Estado: completada para este repositorio** (Firebase, Blob y variables creados por el estudiante; `scripts/probar-conexion.ts` en verde). Para otro estudiante o un entorno nuevo, esta fase es obligatoria y va **antes de escribir cualquier código de base de datos o de Blob**. El estudiante crea sus recursos; tú lo guías y **nunca inventas ni escribes a mano valores de credenciales**.

1. Pregunta, uno por uno: URL del repositorio de GitHub; si el proyecto de Vercel ya está creado y enlazado; plan de Vercel (Hobby o Pro: determina `maxDuration` 300 s / 800 s y la CPU).
2. Guíalo para crear: proyecto en **Firebase** → **Firestore Database** (modo producción, región cercana a las funciones de Vercel; la ubicación no se puede cambiar) → **Authentication → Método de acceso → Correo electrónico/contraseña** → una **app web** (configuración pública) → **Cuentas de servicio → Generar nueva clave privada** (JSON secreto) → en Vercel, **Storage → Blob, store privado** conectado al proyecto.
3. Variables en `.env` (copia `.env.example`; los nombres son estos, y la clave privada lleva los saltos de línea escritos como `\n`):
   - Blob: `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`.
   - Firebase web (públicas por diseño): `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID`.
   - Firebase Admin (secretas, solo servidor): `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`. Del JSON de la cuenta de servicio solo se necesitan esos tres campos; no copies el resto.
   - Las mismas variables se definen en Vercel (Settings → Environment Variables) para Production, Preview y Development.
4. Verifica que `.env*` esté en `.gitignore` **antes** de que existan los archivos con secretos (con la excepción `!.env.example`).
5. `scripts/probar-conexion.ts` escribe, lee y borra un documento temporal en Firestore, lista usuarios de Authentication y lista el almacén de Blob; imprime éxito o el error de cada uno. **No continúes hasta que funcione.**

Problemas conocidos para explicar si falla: clave privada con saltos de línea mal escritos (debe ser `\n` literal dentro de comillas dobles); Firestore sin crear o con otra ubicación; Firestore API deshabilitada en Google Cloud; variables no definidas en el entorno correcto de Vercel; token de Blob ausente en local.

**Si una credencial se imprime o se pega por error en un chat, un log o un commit, considérala comprometida:** genera una nueva clave privada en Firebase, borra la anterior (por su `private_key_id`), actualiza `.env` y Vercel.

Verificación: `npx tsx scripts/probar-conexion.ts` imprime "Firestore OK", "Auth OK" y "Blob OK".

### Fase 1 — Proyecto base y primer despliegue

- El repo ya contiene el proyecto creado con `create-next-app` (Next 16, App Router, TypeScript, ESLint, Tailwind). **Revisa lo que ya hay** antes de añadir nada.
- Quita dependencias de fuentes de Google (`next/font/google`) si existen.
- Estructura sugerida:
  ```
  src/app/                    páginas y Route Handlers
  src/lib/firebase/admin.ts   Firebase Admin (Firestore y Auth), solo servidor
  src/lib/firebase/cliente.ts Firebase Auth en el navegador (variables NEXT_PUBLIC_*)
  src/lib/auth/sesion.ts      cookie de sesión y `exigirUsuario(request)`
  src/lib/blob.ts             utilidades de Blob (rutas, lectura de un archivo)
  src/lib/ocr/                motor tesseract, extractor, validadores, tipos
  src/lib/procesamiento/      lotes, reclamo de archivos, finalización
  src/lib/excel/              generador del Excel
  scripts/                    probar-conexion, verificar, generar-facturas (profesor)
  ```
- Configura `serverExternalPackages` (`tesseract.js`, `sharp`) y `outputFileTracingIncludes` para los datos de idioma de `@tesseract.js-data/spa`.
- Comprueba en la documentación de Next 16 si `firebase-admin` y `@vercel/blob` requieren entrar en `serverExternalPackages`.
- Haz el **primer despliegue ahora** (push a GitHub) aunque la página sea trivial: así los problemas de despliegue aparecen pronto y no al final.

Verificación: `npm run dev` abre la página inicial; `npm run build` termina sin errores; el despliegue de Vercel queda en verde y la URL abre la página.

### Fase 2 — Modelo de datos (Firestore)

Firestore es de **documentos**, no relacional: aquí el diseño parte de qué consultas necesitamos y de cómo garantizar **unicidad** (no hay `UNIQUE`): la unicidad se logra usando el valor único como **ID del documento** y creando el documento dentro de una **transacción**. Explícaselo al estudiante frente al modelo relacional que ya conoce.

Colecciones (campos en `camelCase`; importes COP como **enteros**, nunca decimales; fechas como texto `yyyy-mm-dd` y marcas de tiempo como `Timestamp`):

- `clientes/{documento}`: `documento` (NIT sin puntos ni guion ni DV; es el ID, así que no puede haber dos), `dv`, `nombre`, `creadoEn`, `primerProcesoId`.
- `facturas/{hashArchivo}`: el ID es el **SHA-256** de la imagen (siempre existe, aunque el OCR falle) → el mismo archivo nunca se guarda dos veces. Campos: `numero`, `fecha` (emisión), `proveedor` (razón social), `nitProveedor`, `clienteDocumento` (`null` si no se pudo validar: queda en revisión y **no se crea cliente**), `subtotal` (valor antes de IVA), `iva`, `impoconsumo` (0 si no aplica), `total`, `estado` (`aceptada` | `revision`), `motivos` (lista de textos), `archivo` (nombre original), `blobPathname`, `confianzaOcr`, `procesoId`, `uid` (dueño), `creadoEn`, e **`items`** (lista de `{ descripcion, cantidad, precioUnitario, subtotal }`; van **embebidos** en la factura porque siempre se leen juntos y son pocos; reemplaza a la tabla `items_factura`).
- `indices_numero/{numero}`: `{ hashArchivo }`. Documento auxiliar que hace único el **número de factura**: se crea en la misma transacción que la factura.
- `procesos/{procesoId}`: `uid`, `carpeta` (solo el nombre que mostró el navegador), `estado` (`en_cola` | `subiendo` | `ejecutando` | `terminado` | `error`), `totalArchivos`, `inicio`, `fin`, `rutaExcel` (pathname en Blob).
- `procesos/{procesoId}/archivos/{id}` (la **cola de trabajo**): `blobPathname`, `nombre`, `estado` (`pendiente` | `procesando` | `ok` | `error`), `resultado` (`aceptada` | `revision` | `duplicada` | `error`), `clienteNuevo` (booleano), `intentos`, `error`, y **`disponibleDesde`** (milisegundos de época): `0` mientras espera, `ahora + 5 min` mientras alguien lo procesa (un *arrendamiento* que caduca solo si la función se cae) y `Number.MAX_SAFE_INTEGER` cuando termina. Así la cola se consulta con **un solo campo** (`where("disponibleDesde", "<=", ahora)`) y no hace falta un índice compuesto.

Los contadores de avance **no se guardan** en el documento del proceso (un documento tiene un límite de escrituras sostenidas por segundo y se desincroniza si una función se cae): se calculan con consultas de agregación `count()` sobre `archivos` y `facturas`.

Reglas de seguridad de Firestore: **denegar todo** (`allow read, write: if false;`). Todo el acceso pasa por el servidor. Comprueba en la consola que no queden las reglas del "modo de prueba", que dejan la base abierta y caducan a los 30 días.

Si una consulta pide un índice compuesto, Firestore devuelve un enlace para crearlo en el mensaje de error: explícalo y documéntalo.

Verificación: `scripts/probar-conexion.ts` sigue en verde; las colecciones aparecen en la consola de Firebase tras la primera escritura real (Fase 6); una petición REST anónima a Firestore con la `apiKey` pública **es rechazada** (reglas cerradas).

### Fase A — Autenticación con Firebase (correo y contraseña; antes de la Fase 3)

- **Cliente** (`src/lib/firebase/cliente.ts`, `/login`): `signInWithEmailAndPassword` de `firebase/auth` con las variables `NEXT_PUBLIC_*`. Sin página de registro.
- **Sesión en el servidor**: el cliente envía el ID token a `POST /api/sesion`; el servidor llama a `createSessionCookie(idToken, { expiresIn })` y fija una cookie `httpOnly`, `secure`, `sameSite=lax`. `DELETE /api/sesion` la borra (cerrar sesión). Lee la documentación vigente de Next 16 para `cookies()` (es asíncrona).
- **`exigirUsuario(request)`** verifica la cookie con `verifySessionCookie(cookie, true)` (revocación incluida) y devuelve `uid` y correo, o responde 401. **Todas** las rutas de API la usan (`/api/procesos/*`, `/api/blob/subir`, descargas), y cada proceso, factura y archivo pertenece a un `uid`: un usuario solo ve lo suyo. `proxy.ts` solo hace una comprobación **optimista** (redirige a `/login` si no hay cookie) porque no es el lugar para verificaciones completas; la verificación real está en cada Route Handler.
- **Quién puede entrar:** la `apiKey` es pública, así que cualquiera podría llamar al registro de Firebase. Crea los usuarios a mano en la consola (Authentication → Usuarios), desactiva el registro libre si la consola lo permite (verifica el ajuste vigente) y, además, `POST /api/sesion` solo acepta correos de una lista `USUARIOS_PERMITIDOS` (variable de entorno, separada por comas).
- Pruebas: un usuario de prueba creado en la consola; sin cookie, las rutas devuelven 401.

Verificación: iniciar sesión con el usuario de prueba, ver la página protegida, cerrar sesión, y comprobar con `curl` que `/api/procesos` responde 401 sin cookie.

### Fase 3 — Selección y subida de la carpeta a Blob

El navegador no entrega rutas reales del disco, y ahora el servidor ni siquiera está en el computador del usuario. Por eso:

- La interfaz usa `<input type="file" webkitdirectory multiple>` para elegir la carpeta. Filtra en el cliente `.png/.jpg/.jpeg` y muestra el conteo ("1000 imágenes encontradas") y el tamaño total. Campo opcional **"procesar solo las primeras N"** para probar rápido con 20–50 facturas.
- `POST /api/procesos` (exige sesión) crea el documento en `procesos` (estado `subiendo`, con el `uid` del usuario) y devuelve el `id`.
- `POST /api/blob/subir` es la ruta `handleUpload` que **emite tokens de subida**. Debe validar: que exista un proceso en estado `subiendo`, que la ruta empiece por `procesos/<id>/`, que el tipo sea imagen PNG/JPG y un tamaño máximo razonable. Lee la documentación vigente de `@vercel/blob` para la forma exacta. No dependas de `onUploadCompleted` (no se dispara en local sin túnel): al terminar las subidas, el servidor lista el prefijo con `list()`.
- El cliente sube con `upload()` de `@vercel/blob/client`, con concurrencia limitada (≈6), barra de progreso y reintentos por archivo.
- Esto reemplaza al antiguo explorador de carpetas del servidor: **desaparece el riesgo de recorrer el disco del servidor** (explica el cambio de modelo de seguridad), pero aparece otro: cualquiera con la URL podría gastar cuota de Blob, Firestore y CPU. Por eso la Fase A (autenticación) va **antes** de esta fase y las rutas exigen sesión.

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

El estado vive en Firestore, no en memoria. Todas las rutas exigen sesión y comprueban que el proceso es del usuario. Flujo:

1. `POST /api/procesos/[id]/iniciar`: lista el prefijo `procesos/<id>/` en Blob, crea un documento en `procesos/<id>/archivos` por imagen (estado `pendiente`, `disponibleDesde: 0`; el ID del documento sale de la ruta del blob, así que repetir la llamada no duplica), fija `totalArchivos` (respetando `limite`) y pasa el proceso a `ejecutando`. Responde de inmediato. (Un lote de escritura admite 500 operaciones: usa `BulkWriter` o varios lotes para 1000 archivos.)
2. `POST /api/procesos/[id]/lote`: **reclama** hasta N archivos dentro de **una transacción de Firestore**: lee `archivos` con `where("disponibleDesde", "<=", ahora).orderBy("disponibleDesde").limit(N)` y, para cada uno, actualiza `estado: "procesando"`, `intentos + 1` y `disponibleDesde: ahora + 5 min`. Dos invocaciones concurrentes nunca toman el mismo archivo (la transacción se reintenta si hay conflicto) y los que quedaron "procesando" por una función caída vuelven a estar disponibles cuando caduca el arrendamiento. Procesa cada archivo (OCR → extraer → validar) y lo guarda. Responde con el avance.
3. El **cliente** (la página) ejecuta un bucle con 3–4 llamadas a `/lote` concurrentes hasta que no quedan pendientes. Si el usuario cierra la pestaña, al volver a abrir el proceso el bucle **continúa** donde quedó (todo es idempotente). Cron/Vercel Workflow quedan como mejora opcional para no depender del navegador abierto.
4. `GET /api/procesos/[id]` devuelve el avance calculado con `count()` (procesados / total, aceptadas, en revisión, duplicadas, clientes nuevos y existentes, tiempo). La página consulta cada segundo. SSE es una mejora opcional.
5. Cuando no quedan archivos pendientes ni en proceso, `POST /api/procesos/[id]/finalizar` (idempotente) cierra el proceso y dispara la Fase 7.

Por cada factura, en **una transacción de Firestore** (todas las lecturas van **antes** de las escrituras): lee `facturas/{hashArchivo}` y `indices_numero/{numero}`; si alguno existe, **omite** y marca el archivo como `duplicada`; si el documento del cliente pasa el dígito de verificación, lee `clientes/{documento}` y lo **crea solo si no existe** (nunca sobrescribas el nombre de un cliente existente; `clienteNuevo` indica cuál fue el caso); crea la factura (con sus ítems embebidos) y el índice del número; marca el archivo como `ok`. Como el ID del cliente es su documento, es **imposible** que existan dos clientes con el mismo documento, aunque dos lotes concurrentes lo intenten a la vez.

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

Verificación: descargar el Excel desde la interfaz; la suma de la columna `total` coincide con la agregación `sum()` de Firestore sobre `facturas`.

### Fase 8 — Interfaz y verificación final

- Página principal: estado de las conexiones (Firestore, Auth y Blob) y del usuario con sesión iniciada, selector de carpeta, botón **Procesar**, barras de subida y de procesamiento.
- Página de resultados: tabla de facturas con filtro por `estado`, enlace al Excel y a la imagen original (servida por una ruta nuestra desde el Blob privado).
- Opcional (mejora): **cola de revisión manual**, donde el usuario corrige una factura en `revision` y la aprueba.
- `npm run verificar -- <ruta de verdad.json>`: compara la base de datos con el archivo de respuestas correctas (si el profesor lo entrega) e imprime: facturas y clientes en base de datos, exactitud por campo, aceptadas con error no detectado, **clientes que no existen en la verdad** (deben ser 0) y si se cumplen 1000 facturas / 850 clientes.

Verificación final **en la URL de producción de Vercel** con la carpeta completa: 1000 facturas, 850 clientes, Excel generado y descargable, reprocesar no duplica.

### Fase D — Despliegue y operación en Vercel

Se trabaja en paralelo con las demás fases (primer despliegue en la Fase 1), pero esta lista debe estar completa al final:

- Variables de entorno definidas en Production, Preview y Development; ningún secreto en el repo (`git log -p` sin secretos).
- `maxDuration` configurado en las rutas de lote y finalización según el plan; tamaño de lote y concurrencia justificados con las mediciones de la Fase 5.
- **Autenticación:** decidida (Firebase Authentication, ver Fase A). Comprueba en producción que ninguna ruta de API responde sin sesión y que `USUARIOS_PERMITIDOS`, `FIREBASE_ADMIN_PRIVATE_KEY` y el resto de variables están definidas en Vercel. Revisa que las reglas de Firestore sigan en "denegar todo".
- Los blobs de producción se borran o se conservan según una política explícita (p. ej. borrar las imágenes de procesos antiguos); decide con el estudiante y documéntalo.
- Registro de errores: revisa los *runtime logs* de Vercel tras la corrida completa y reporta cualquier 504, 413 o error de conexión a la base de datos.

Verificación: la corrida completa en producción sin errores en los logs, y una nota con el uso de cuota (Blob, CPU activa en Vercel; lecturas, escrituras y borrados en Firestore; usuarios en Authentication) que dejó.

### Fase G — Generador de facturas (SOLO PROFESOR; los estudiantes reciben un zip)

**Estado: implementado** en `scripts/generar-facturas.ts` (+ `scripts/generador/datos.ts` y `disenos.ts`). Uso: `npm run generar:facturas -- --cantidad 10 --semilla 2026 --salida salida`. Por defecto genera **10** facturas para ir probando; para el ejercicio completo se usa `--cantidad 1000`. Las proporciones (850/1000 clientes distintos, 60/30/10 de calidad, ~15 % móviles) se escalan con la cantidad.

- **Cero tokens:** todo es determinista (`@faker-js/faker` con semilla fija + HTML renderizado con `playwright` + degradación con `sharp`). **No se usa ningún LLM** para generar facturas. (El `.env` local tiene una `DEEPSEEK_API_KEY`: el generador no la usa; si algún día se usa, que sea como mejora opcional de extracción para facturas en `revision`, nunca para generar datos.)
- Crea primero un **pool de clientes únicos** (documento de 9 dígitos con **dígito de verificación válido**, usando `src/lib/ocr/nit.ts`) y asigna las facturas restantes a clientes ya usados; un cliente repetido conserva **exactamente el mismo documento y nombre**. Mezcla el orden final.
- Cada factura incluye: proveedor (razón social ficticia, NIT con DV válido, dirección, responsabilidad de IVA, resolución DIAN), número único `FE-000001…` sin relación con el nombre del archivo, fecha y hora de emisión, fecha de vencimiento, forma y medio de pago, **documento y nombre del cliente**, 1–6 ítems, **valor antes de IVA, IVA 19 %, impoconsumo 4 % (solo facturas de telefonía móvil)**, total y un CUFE simulado (SHA-384 con la estructura de la DIAN y clave técnica ficticia: no es verificable). Cada imagen lleva el aviso "documento sintético con datos ficticios para fines académicos".
- **4 diseños** (clásico con tabla, encabezado de color con texto blanco, ticket POS angosto, caja con borde doble), con fuentes, etiquetas de totales, formatos de NIT y de fecha distintos. Hay descripciones largas que se parten en dos líneas y una descripción con "Monitor" (falso positivo de "nit").
- Calidad por cuotas: limpia (PNG), media (rotación leve, desenfoque, JPEG 70) y mala (65 % de resolución, rotación, desenfoque, JPEG ~38).
- Salida: `salida/facturas/` con **solo las imágenes** (`factura_0001.png|jpg` …) y `salida/verdad.json` (datos correctos de cada factura, incluidos ítems, diseño y calidad) **fuera** de esa carpeta. `salida/` está en `.gitignore`.
- Al terminar el script **comprueba y falla (exit 1)** si: el número de imágenes no coincide, hay números repetidos, `subtotal + IVA + INC ≠ total`, el impoconsumo no es coherente con "móvil" o algún DV es inválido. Imprime imágenes, clientes distintos, repeticiones, móviles, diseños, calidad y tamaño.
- Para el zip del curso: `--cantidad 1000` y revisar que el tamaño del zip sea del orden de 90 MB (medido: 1000 facturas ocupan 108,7 MB; con 10 ocupan ~1 MB).

Verificación: el resumen se imprime con las comprobaciones en OK y se revisan a ojo 4 imágenes (una por diseño) — hecho con 10 facturas.

## 6. Cuando termines todo

Entrega al estudiante: qué hace cada carpeta, cómo ejecutar en local (copiar `.env.example` a `.env`, rellenarlo y `npm run dev`), cómo desplegar, cómo correr las pruebas, qué resultados obtuvo con la carpeta completa en la URL de producción (con números reales: tiempos, cuota usada, exactitud) y **qué no pudiste verificar**.
