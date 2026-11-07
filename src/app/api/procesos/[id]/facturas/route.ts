import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Factura } from "@/lib/modelo/tipos";
import { colaArchivos } from "@/lib/procesamiento/cola";
import { procesoDelUsuario } from "@/lib/procesamiento/proceso";

/** Facturas del proceso (por el hash de cada archivo). Cuesta ~2 lecturas por factura: solo se pide al terminar. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/procesos/[id]/facturas">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { id } = await ctx.params;
  const dueno = await procesoDelUsuario(id, usuario.uid);
  if (dueno instanceof Response) return dueno;

  const archivos = (await colaArchivos(id).get()).docs.map((d) => d.data() as ArchivoCola);
  const hashes = [...new Set(archivos.map((a) => a.hashArchivo).filter((h): h is string => Boolean(h)))];
  const db = firestore();
  const refs = hashes.map((h) => db.collection(COLECCIONES.facturas).doc(h));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const facturas = snaps
    .filter((s) => s.exists)
    .map((s) => {
      const f = s.data() as Factura;
      return {
        hash: s.id, archivo: f.archivo, numero: f.numero, fecha: f.fecha, proveedor: f.proveedor, clienteDocumento: f.clienteDocumento,
        clienteNombre: f.clienteNombre, subtotal: f.subtotal, iva: f.iva, impoconsumo: f.impoconsumo, total: f.total,
        estado: f.estado, motivos: f.motivos, confianzaOcr: f.confianzaOcr,
      };
    })
    .sort((a, b) => (a.numero ?? "~").localeCompare(b.numero ?? "~") || a.archivo.localeCompare(b.archivo));
  return Response.json({ facturas });
}
