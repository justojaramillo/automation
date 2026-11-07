import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";

/**
 * Métricas de todos los lotes del usuario en UNA consulta: cada proceso lleva sus contadores
 * (actualizados dentro de la transacción de cada factura), así que no se recorren las facturas.
 * Costo: 1 lectura por lote + 1 por el conteo de clientes.
 */
export async function GET(request: NextRequest) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const db = firestore();
  const [procesos, clientes] = await Promise.all([
    db.collection(COLECCIONES.procesos).where("uid", "==", usuario.uid).limit(200).get(),
    db.collection(COLECCIONES.clientes).count().get(),
  ]);
  const lotes = procesos.docs
    .map((d) => ({ id: d.id, ...(d.data() as Proceso) }))
    .filter((p) => p.estado === "ejecutando" || p.estado === "terminado")
    .sort((a, b) => a.inicio.toMillis() - b.inicio.toMillis())
    .map((p, i) => ({
      id: p.id,
      numero: i + 1,
      carpeta: p.carpeta,
      estado: p.estado,
      totalArchivos: p.totalArchivos,
      inicio: p.inicio.toMillis(),
      fin: p.fin?.toMillis() ?? null,
      tieneExcel: Boolean(p.rutaExcel),
      metricas: p.metricas ?? {},
    }));
  return Response.json({ lotes, clientesEnBase: clientes.data().count });
}
