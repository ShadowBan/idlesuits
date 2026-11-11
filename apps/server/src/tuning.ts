import { cleanTuning, type EngineTuning } from '@idlesuits/engine';

/** The pit boss's tuning, read from the database at most this often per Worker (or per player's object). */
const TUNING_TTL_MS = 10_000;
let cache: { at: number; tuning: EngineTuning } | null = null;

/** The tuning rounds are decided under: one row of the database, cached a few seconds. */
export async function readTuning(env: { DB: D1Database }): Promise<EngineTuning> {
  if (cache && Date.now() - cache.at < TUNING_TTL_MS) return cache.tuning;
  const row = await env.DB.prepare('SELECT data FROM tuning WHERE id = 1').first<{ data: string }>();
  let raw: unknown = {};
  try {
    raw = row ? JSON.parse(row.data) : {};
  } catch {
    // A bad row reads as the defaults.
  }
  const tuning = cleanTuning(raw);
  cache = { at: Date.now(), tuning };
  return tuning;
}

/** The pit boss just changed it: this copy knows at once. */
export function rememberTuning(tuning: EngineTuning) {
  cache = { at: Date.now(), tuning };
}
