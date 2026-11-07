// TEMPORAL: diagnostica por qué firebase-admin falla en Vercel. Se elimina después. No devuelve valores de variables.
import { connection } from "next/server";

const corto = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : String(e).slice(0, 400));

export async function GET() {
  await connection();
  const r: Record<string, string> = {};
  try { await import("firebase-admin/app"); r.app = "ok"; } catch (e) { r.app = corto(e); }
  try { await import("firebase-admin/auth"); r.auth = "ok"; } catch (e) { r.auth = corto(e); }
  try { await import("firebase-admin/firestore"); r.firestore = "ok"; } catch (e) { r.firestore = corto(e); }
  try {
    const { firestore } = await import("@/lib/firebase/admin");
    await firestore().collection("_pruebas").doc("diag").get();
    r.lecturaFirestore = "ok";
  } catch (e) { r.lecturaFirestore = corto(e); }
  try { await import("@vercel/blob"); r.blob = "ok"; } catch (e) { r.blob = corto(e); }
  try { await import("exceljs"); r.exceljs = "ok"; } catch (e) { r.exceljs = corto(e); }
  try { await import("tesseract.js"); r.tesseract = "ok"; } catch (e) { r.tesseract = corto(e); }
  return Response.json(r);
}
