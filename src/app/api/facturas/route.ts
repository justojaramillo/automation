import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

/**
 * Facturas que esperan a una persona (la máquina no pudo aceptarlas): solo las del usuario. Solo filtros de
 * igualdad (sin índice compuesto). Cuesta una lectura por factura listada; se limita a 200.
 */
export async function GET(request: NextRequest) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  let consulta = firestore().collection(COLECCIONES.facturas).where("uid", "==", usuario.uid).where("estado", "==", "revision");
  const procesoId = request.nextUrl.searchParams.get("procesoId");
  if (procesoId) consulta = consulta.where("procesoId", "==", procesoId);
  const snap = await consulta.limit(200).get();
  const facturas = snap.docs
    .map((d) => {
      const f = d.data() as Factura;
      return { hash: d.id, archivo: f.archivo, procesoId: f.procesoId, numero: f.numero, proveedor: f.proveedor, total: f.total, motivos: f.motivos, confianzaOcr: f.confianzaOcr };
    })
    .sort((a, b) => a.archivo.localeCompare(b.archivo, "es", { numeric: true }));
  return Response.json({ facturas, hayMas: snap.size === 200 });
}
