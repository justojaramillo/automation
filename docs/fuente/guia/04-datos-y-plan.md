## 6. Datos del ejercicio y plan paso a paso

### Datos del ejercicio (criterio de aceptación)

El profesor entrega **una carpeta `facturas/` con 1000 imágenes** (`factura_0001.png|jpg` … `factura_1000`), solo imágenes, de **850 clientes distintos**: 850 clientes aparecen una vez y **150 facturas son de clientes que ya existen** (repetidos). Las imágenes son sintéticas (datos ficticios): 4 diseños de factura (250 de cada uno), 3 calidades (60 % limpias, 30 % de calidad media, 10 % malas: rotadas, borrosas o de baja resolución), 150 con impoconsumo (telefonía móvil). **Esa carpeta se elige desde el navegador** (selector de carpeta) y se sube a Blob: no se copia a ninguna ruta del servidor.

Al terminar de procesar la carpeta completa:

- `facturas` tiene **1000 documentos**. Las dudosas quedan con `estado = "revision"`: **no se pierden**.
- `clientes` tiene **850 documentos**, sin duplicados ni clientes inventados por errores del OCR.
- **Reprocesar la misma carpeta no duplica nada** (idempotencia), aunque las imágenes se suban otra vez con otra ruta.
- Cada lote tiene su Excel y sus métricas; la suma de la columna Total del Excel coincide con la base de datos.

**Qué exactitud esperar.** Medida en el repositorio de referencia **sobre las 1000 facturas del curso** (solo extracción, sin base de datos): **915 aceptadas automáticamente (92 %) y 85 a revisión**; de las 915 aceptadas, **912 totalmente correctas y 3 con un error que la validación no detectó**. Con otros conjuntos de facturas la cifra varió entre 82 % y 98 %, y una muestra de 100 del mismo conjunto dio 85 %: una muestra pequeña engaña. El 100 % no existe con OCR sobre imágenes degradadas. Los motivos de revisión más comunes: documento del cliente no leído, proveedor no leído e ítems que no suman el subtotal. Una factura "aceptada" solo significa que pasó todas las validaciones; un error que cuadre aritméticamente (por ejemplo, un dígito mal leído en el número de factura) puede pasar. **Mide con tu conjunto; no supongas.**

### Orden recomendado

Las fases conservan el número histórico (por eso `fase-3` va después de `fase-5`): el orden de trabajo es el de esta tabla.

| Paso | Fase | Resultado | Cómo se demuestra |
|---|---|---|---|
| 1 | 0 | Cuentas y conexiones | `npx tsx scripts/probar-conexion.ts` → Firestore OK, Auth OK, Blob OK |
| 2 | 1 | Proyecto base y primer despliegue | `npm run build` y la URL de Vercel abre |
| 3 | 2 | Modelo de datos y reglas cerradas | `npx tsx scripts/verificar-reglas.ts` → 403 anónimos |
| 4 | A | Autenticación | login real + `curl` a `/api/procesos` sin cookie → 401 |
| 5 | 4 | Extractor y validador (lógica pura) | `npm test` |
| 6 | 5 | OCR dentro de una función de Vercel | 20 facturas leídas **en el despliegue** |
| 7 | 3 | Subida de la carpeta a Blob | 20 archivos bajo `procesos/<id>/` en el panel de Blob |
| 8 | 6 | Lotes, cola y guardado idempotente | procesar dos veces no duplica nada |
| 9 | 7 | Excel en Blob | la suma del Excel = la suma en Firestore |
| 10 | 8 | Interfaz, motor, métricas y borrado | recorrido completo con navegador real |
| 11 | D | Operación en Vercel | logs sin errores, nota de cuota |
