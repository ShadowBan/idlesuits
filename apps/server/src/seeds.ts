/**
 * The seeds that decide a member's rounds. Each player has a secret key, kept
 * only in their Durable Object; a round's seed is an HMAC of the key, the game
 * and the round's number, so it can't be known until the round has been
 * played, and a seed shown after (in a replay) gives nothing away about the next.
 */

const enc = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh secret key, as hex. */
export function newSeedKey(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

function importKey(key: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(key.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * The seeds for the rounds an action could need, worked out ahead (Web Crypto
 * is asynchronous; the engine is not): a game's rounds from `from`, `count` of
 * them. Returns a lookup the engine calls; asking for a seed not worked out is a bug.
 */
export async function seedsFor(key: string, wanted: { game: string; from: number; count: number }[]): Promise<(game: string, round: number) => string> {
  const k = await importKey(key);
  const seeds = new Map<string, string>();
  await Promise.all(
    wanted.flatMap(({ game, from, count }) =>
      Array.from({ length: count }, async (_, i) => {
        const id = `${game}:${from + i}`;
        seeds.set(id, hex(await crypto.subtle.sign('HMAC', k, enc.encode(id))));
      }),
    ),
  );
  return (game, round) => {
    const seed = seeds.get(`${game}:${round}`);
    if (!seed) throw new Error(`No seed worked out for ${game} round ${round}.`);
    return seed;
  };
}
