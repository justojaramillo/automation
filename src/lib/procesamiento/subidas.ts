// ¿Admite este lote nuevas imágenes? Debe ser del usuario y estar en estado `subiendo`. Cada imagen es una
// petición distinta; para no gastar una lectura de Firestore por imagen, la respuesta afirmativa se recuerda
// 20 s en la memoria de la instancia (el lote pasa a `ejecutando` solo cuando el usuario ya terminó de subir).

import { procesoDelUsuario } from "./proceso";

const TTL_MS = 20_000;
const cache = globalThis as unknown as { __subidasOk?: Map<string, number> };

export async function loteAdmiteSubidas(procesoId: string, uid: string): Promise<boolean> {
  const memoria = (cache.__subidasOk ??= new Map<string, number>());
  const clave = `${uid}:${procesoId}`;
  const hasta = memoria.get(clave);
  if (hasta && hasta > Date.now()) return true;
  const dueno = await procesoDelUsuario(procesoId, uid);
  if (dueno instanceof Response || dueno.proceso.estado !== "subiendo") return false;
  memoria.set(clave, Date.now() + TTL_MS);
  if (memoria.size > 500) for (const [k, v] of memoria) if (v < Date.now()) memoria.delete(k);
  return true;
}
