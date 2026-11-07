export const cop = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString("es-CO"));
export const num = (n: number): string => n.toLocaleString("es-CO");
export const pct = (n: number | null): string => (n === null ? "—" : `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);
export const fechaHora = (ms: number): string =>
  new Date(ms).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
