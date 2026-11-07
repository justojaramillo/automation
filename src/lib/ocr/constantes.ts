// Tarifas tributarias colombianas, parametrizadas (verifícalas con un contador antes de producción).
// INC (impoconsumo): 4 % sobre telefonía móvil, datos e internet móvil; se liquida sobre el valor
// SIN IVA y convive con el IVA. (Matiz: para datos móviles la base real es lo que exceda 1,5 UVT
// mensuales; el generador de facturas lo simplifica aplicando el 4 % a todo el servicio.)
export const IVA_TARIFA = 0.19;
export const INC_TARIFA = 0.04;
/** Tolerancia en pesos para redondeos de impuestos. */
export const TOLERANCIA_PESOS = 1;
