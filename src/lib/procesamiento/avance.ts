// Avance calculado con consultas de agregación count() (no se guardan contadores: un documento tiene
// un límite de escrituras sostenidas y se desincroniza si una función se cae).
// OJO cuota: cada count() cuesta como MÍNIMO 1 lectura. Son 7 por consulta → sondeo cada 4 s o más.

import { TERMINADO } from "@/lib/modelo/tipos";
import { colaArchivos } from "./cola";

export interface Avance {
  terminados: number;
  aceptadas: number;
  revision: number;
  duplicadas: number;
  errores: number;
  clientesNuevos: number;
  clientesExistentes: number;
  /** Lecturas aproximadas que costó esta consulta. */
  lecturasEstimadas: number;
}

export async function calcularAvance(procesoId: string): Promise<Avance> {
  const c = colaArchivos(procesoId);
  const contar = async (q: FirebaseFirestore.Query): Promise<number> => (await q.count().get()).data().count;
  const [terminados, aceptadas, revision, duplicadas, errores, nuevos, existentes] = await Promise.all([
    contar(c.where("disponibleDesde", "==", TERMINADO)),
    contar(c.where("resultado", "==", "aceptada")),
    contar(c.where("resultado", "==", "revision")),
    contar(c.where("resultado", "==", "duplicada")),
    contar(c.where("resultado", "==", "error")),
    contar(c.where("clienteNuevo", "==", true)),
    contar(c.where("clienteExistente", "==", true)),
  ]);
  return {
    terminados, aceptadas, revision, duplicadas, errores, clientesNuevos: nuevos, clientesExistentes: existentes,
    lecturasEstimadas: 7 + Math.ceil((terminados * 6) / 1000),
  };
}

/** Archivos que aún no terminan (pendientes o en proceso). */
export async function contarSinTerminar(procesoId: string): Promise<number> {
  return (await colaArchivos(procesoId).where("disponibleDesde", "<", TERMINADO).count().get()).data().count;
}
