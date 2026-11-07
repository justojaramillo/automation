// Aplica los cambios de métricas DENTRO de una transacción (después de todas las lecturas).
// Son escrituras ciegas con increment: no leen el documento del proceso, así que no provocan
// reintentos por contención entre lotes concurrentes.

import { FieldPath, FieldValue, type Transaction } from "firebase-admin/firestore";
import { cambiosDe, type EventoMetrica } from "./metricas";
import { refProceso } from "./proceso";

export function aplicarMetricas(tx: Transaction, procesoId: string, evento: EventoMetrica): void {
  const campos = cambiosDe(evento).flatMap((c) => [
    new FieldPath(...c.ruta),
    "incremento" in c ? FieldValue.increment(c.incremento) : c.texto,
  ]);
  const [primero, valor, ...resto] = campos;
  tx.update(refProceso(procesoId), primero as FieldPath, valor, ...resto);
}
