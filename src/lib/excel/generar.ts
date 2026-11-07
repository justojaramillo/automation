// Excel del proceso, generado A PARTIR DE LA BASE DE DATOS (no de memoria). Celdas numéricas reales
// con formato de moneda, fechas reales, encabezados con filtro y fila fija.

import ExcelJS from "exceljs";
import { firestore } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Cliente, type Factura, type Proceso } from "@/lib/modelo/tipos";
import { colaArchivos } from "@/lib/procesamiento/cola";

const MONEDA = '"$"#,##0';

function hoja(wb: ExcelJS.Workbook, nombre: string, columnas: { header: string; key: string; width: number; moneda?: boolean; fecha?: boolean }[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({
    header: c.header, key: c.key, width: c.width,
    style: c.moneda ? { numFmt: MONEDA } : c.fecha ? { numFmt: "yyyy-mm-dd" } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

const aFecha = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/** Nombre `resultado_AAAA-MM-DD_HHmm.xlsx` con la hora de Colombia. */
export function nombreExcel(ahora = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(ahora);
  return `resultado_${p.replace(" ", "_").replace(":", "")}.xlsx`;
}

export async function generarExcel(procesoId: string, proceso: Proceso, fin: Date): Promise<Buffer> {
  const db = firestore();
  const archivosSnap = await colaArchivos(procesoId).get();
  const archivos = archivosSnap.docs.map((d) => d.data() as ArchivoCola);

  // Facturas del proceso: por el hash de cada archivo (incluye las "duplicadas" de reprocesos).
  const hashes = [...new Set(archivos.map((a) => a.hashArchivo).filter((h): h is string => Boolean(h)))];
  const refsF = hashes.map((h) => db.collection(COLECCIONES.facturas).doc(h));
  const facturas = (refsF.length ? await db.getAll(...refsF) : []).filter((s) => s.exists).map((s) => s.data() as Factura);
  facturas.sort((a, b) => (a.numero ?? "~").localeCompare(b.numero ?? "~") || a.archivo.localeCompare(b.archivo));

  const docs = [...new Set(facturas.map((f) => f.clienteDocumento).filter((d): d is string => Boolean(d)))];
  const refsC = docs.map((d) => db.collection(COLECCIONES.clientes).doc(d));
  const clientes = new Map((refsC.length ? await db.getAll(...refsC) : []).filter((s) => s.exists).map((s) => [s.id, s.data() as Cliente]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Procesador de facturas";
  wb.created = fin;

  const wsF = hoja(wb, "Facturas", [
    { header: "Archivo", key: "archivo", width: 22 }, { header: "Número", key: "numero", width: 14 },
    { header: "Fecha", key: "fecha", width: 12, fecha: true }, { header: "Proveedor", key: "proveedor", width: 38 },
    { header: "NIT proveedor", key: "nit", width: 14 }, { header: "Documento cliente", key: "doc", width: 16 },
    { header: "Cliente", key: "cliente", width: 38 }, { header: "Valor antes de IVA", key: "subtotal", width: 18, moneda: true },
    { header: "IVA", key: "iva", width: 14, moneda: true }, { header: "Impoconsumo", key: "inc", width: 14, moneda: true },
    { header: "Total", key: "total", width: 16, moneda: true }, { header: "Estado", key: "estado", width: 11 },
    { header: "Motivos", key: "motivos", width: 60 }, { header: "Confianza OCR", key: "conf", width: 14 },
  ]);
  for (const f of facturas) {
    wsF.addRow({
      archivo: f.archivo, numero: f.numero, fecha: aFecha(f.fecha), proveedor: f.proveedor, nit: f.nitProveedor,
      doc: f.clienteDocumento, cliente: (f.clienteDocumento && clientes.get(f.clienteDocumento)?.nombre) || f.clienteNombre,
      subtotal: f.subtotal, iva: f.iva, inc: f.impoconsumo, total: f.total, estado: f.estado, motivos: f.motivos.join("; "), conf: f.confianzaOcr,
    });
  }

  const wsI = hoja(wb, "Ítems", [
    { header: "Número de factura", key: "numero", width: 18 }, { header: "Descripción", key: "desc", width: 60 },
    { header: "Cantidad", key: "cant", width: 10 }, { header: "Precio unitario", key: "precio", width: 16, moneda: true },
    { header: "Subtotal", key: "sub", width: 16, moneda: true },
  ]);
  for (const f of facturas) for (const it of f.items) wsI.addRow({ numero: f.numero, desc: it.descripcion, cant: it.cantidad, precio: it.precioUnitario, sub: it.subtotal });

  const wsC = hoja(wb, "Clientes", [
    { header: "Documento", key: "doc", width: 14 }, { header: "Nombre", key: "nombre", width: 42 },
    { header: "Número de facturas", key: "n", width: 18 }, { header: "Total comprado", key: "total", width: 18, moneda: true },
  ]);
  for (const [doc, cli] of [...clientes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const suyas = facturas.filter((f) => f.clienteDocumento === doc);
    wsC.addRow({ doc, nombre: cli.nombre, n: suyas.length, total: suyas.reduce((a, f) => a + (f.total ?? 0), 0) });
  }

  const cuenta = (r: string) => archivos.filter((a) => a.resultado === r).length;
  const minutos = (fin.getTime() - proceso.inicio.toMillis()) / 60000;
  const wsR = hoja(wb, "Resumen", [{ header: "Concepto", key: "k", width: 34 }, { header: "Valor", key: "v", width: 22 }]);
  wsR.addRows([
    { k: "Carpeta", v: proceso.carpeta }, { k: "Total de archivos", v: archivos.length },
    { k: "Aceptadas", v: cuenta("aceptada") }, { k: "En revisión", v: cuenta("revision") },
    { k: "Duplicadas (ya procesadas)", v: cuenta("duplicada") }, { k: "Con error", v: cuenta("error") },
    { k: "Clientes nuevos", v: archivos.filter((a) => a.clienteNuevo).length },
    { k: "Clientes existentes", v: archivos.filter((a) => a.clienteExistente).length },
    { k: "Duración total (minutos)", v: Math.round(minutos * 10) / 10 },
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
