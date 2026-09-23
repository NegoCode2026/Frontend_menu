/**
 * Registry slug -> backend (docker on-premise del cliente).
 *
 * DOS modos (se combinan, remoto gana):
 *
 * A) Horneado (este archivo): para fijos que nunca cambian.
 *    Requiere redeploy en Vercel.
 *
 * B) Remoto (recomendado, SIN redeploy): un JSON público con el mismo
 *    formato {"slug": "https://api-cliente.xxx"} que editas sin tocar código.
 *    Dónde hostearlo (elige una):
 *    - Supabase Storage bucket público `config/tenant-backends.json`
 *      (Dashboard -> Storage -> New bucket `config` público -> subir JSON).
 *    - Cualquier URL pública que devuelva ese JSON.
 *    Pega esa URL en TENANT_BACKENDS_URL y listo.
 *
 * Vender uno nuevo (modo B): levanta su docker, agrega la línea al JSON
 * remoto, y el front lo toma solo en segundos. Cero pushes.
 *
 * Todos los dockers apuntan a la misma DB Supabase y comparten JWT_SECRET,
 * así que cualquier docker responde auth, pero los UPLOADS viven en cada
 * máquina: por eso el front fija (pin) el backend del slug y todas las
 * llamadas de ese menú/pedido van al mismo docker.
 */
export const TENANT_BACKENDS: Record<string, string> = {
  // 'fritomix': 'https://api-fritomix.trycloudflare.com',
};

/** URL pública del JSON remoto. Vacío = desactivado (solo horneado). */
export const TENANT_BACKENDS_URL = '';

/** Fallback cuando no hay slug (admin directo, login sin contexto): proxy Vercel /api */
export const DEFAULT_BACKEND = '/api';
