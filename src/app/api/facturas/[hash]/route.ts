import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";
import { corregirFactura } from "@/lib/procesamiento/corregir";
import { esquemaCorreccion } from "@/lib/procesamiento/correccion-esquema";

const HASH = /^[a-f0-9]{64}$/;

/** Una factura completa (la del usuario) para precargar el formulario de revisión. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/facturas/[hash]">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { hash } = await ctx.params;
  if (!HASH.test(hash)) return Response.json({ error: "Identificador no válido" }, { status: 400 });
  const snap = await firestore().collection(COLECCIONES.facturas).doc(hash).get();
  if (!snap.exists || (snap.data() as Factura).uid !== usuario.uid) return Response.json({ error: "No encontrada" }, { status: 404 });
  const f = snap.data() as Factura;
  return Response.json({
    hash, archivo: f.archivo, procesoId: f.procesoId, estado: f.estado, motivos: f.motivos, confianzaOcr: f.confianzaOcr,
    corregidaManualmente: Boolean(f.corregidaManualmente), corregidaPor: f.corregidaPor ?? null, motivosOriginales: f.motivosOriginales ?? [],
    datos: {
      numero: f.numero ?? "", fecha: f.fecha ?? "", proveedor: f.proveedor ?? "", nitProveedor: f.nitProveedor ?? "", dvProveedor: f.dvProveedor ?? null,
      clienteDocumento: f.clienteDocumento ?? f.clienteDocumentoLeido ?? "", clienteDv: f.clienteDv ?? null, clienteNombre: f.clienteNombre ?? "",
      items: f.items, subtotal: f.subtotal, iva: f.iva, impoconsumo: f.impoconsumo, total: f.total,
    },
  });
}

/** Guarda lo que una persona ingresó o corrigió mirando la imagen. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/facturas/[hash]">) {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  const { hash } = await ctx.params;
  if (!HASH.test(hash)) return Response.json({ error: "Identificador no válido" }, { status: 400 });
  const cuerpo = esquemaCorreccion.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) {
    const problemas = cuerpo.error.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`);
    return Response.json({ error: "Datos no válidos", problemas }, { status: 400 });
  }
  const r = await corregirFactura({ hash, uid: usuario.uid, email: usuario.email, datos: cuerpo.data.datos, confirmado: cuerpo.data.confirmado });
  return r.ok ? Response.json(r) : Response.json({ error: r.error, motivos: r.motivos }, { status: r.status });
}
