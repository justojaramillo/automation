// Borra TODO lo guardado por la app (facturas, clientes, índices, lotes, imágenes y Excel de Blob).
// Pensado para que los estudiantes puedan probar desde cero. Es destructivo e irreversible, por eso:
// exige sesión, una confirmación escrita ("BORRAR") y se niega si hay lotes en ejecución (salvo `forzar`).
// Cuota: cada documento borrado cuenta contra el límite diario de borrados de Firestore.

import { del, list } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const cuerpo = (await request.json().catch(() => null)) as { confirmacion?: unknown; forzar?: unknown } | null;
  if (cuerpo?.confirmacion !== "BORRAR") {
    return Response.json({ error: 'Escribe "BORRAR" para confirmar' }, { status: 400 });
  }
  const db = firestore();
  const enEjecucion = (await db.collection(COLECCIONES.procesos).where("estado", "==", "ejecutando").count().get()).data().count;
  if (enEjecucion > 0 && cuerpo.forzar !== true) {
    return Response.json({ error: "Hay lotes procesándose", enEjecucion }, { status: 409 });
  }

  const borrados: Record<string, number> = {};
  for (const nombre of [COLECCIONES.facturas, COLECCIONES.indicesNumero, COLECCIONES.clientes, COLECCIONES.procesos]) {
    const coleccion = db.collection(nombre);
    borrados[nombre] = (await coleccion.count().get()).data().count;
    await db.recursiveDelete(coleccion); // incluye subcolecciones (procesos/{id}/archivos)
  }

  let imagenes = 0;
  for (let cursor: string | undefined; ; ) {
    const pagina = await list({ prefix: "procesos/", limit: 1000, cursor });
    for (let i = 0; i < pagina.blobs.length; i += 200) {
      await del(pagina.blobs.slice(i, i + 200).map((b) => b.pathname));
    }
    imagenes += pagina.blobs.length;
    if (!pagina.hasMore) break;
    cursor = pagina.cursor;
  }
  return Response.json({ borrados, archivosBlob: imagenes });
}
