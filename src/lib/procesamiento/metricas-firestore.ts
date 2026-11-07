// Aplica los cambios de métricas DENTRO de una transacción (después de todas las lecturas).
// Son escrituras ciegas con increment: no leen el documento del proceso, así que no provocan
// reintentos por contención entre lotes concurrentes.

import { FieldPath, FieldValue, type Transaction } from "firebase-admin/firestore";
import { cambiosDe, type Cambio, type EventoMetrica } from "./metricas";
import { refProceso } from "./proceso";

export function aplicarMetricas(tx: Transaction, procesoId: string, evento: EventoMetrica): void {
  aplicarCambios(tx, procesoId, cambiosDe(evento));
}

export function aplicarCambios(tx: Transaction, procesoId: string, cambios: Cambio[]): void {
  if (cambios.length === 0) return;
  const campos = cambios.flatMap((c) => [
    new FieldPath(...c.ruta),
    "incremento" in c ? FieldValue.increment(c.incremento) : c.texto,
  ]);
  const [primero, valor, ...resto] = campos;
  tx.update(refProceso(procesoId), primero as FieldPath, valor, ...resto);
}
