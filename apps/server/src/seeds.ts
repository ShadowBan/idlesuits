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

// A synchronous HMAC-SHA256, the same seeds as `seedsFor` gives, for an action
// that can't know ahead how many rounds it will play (auto play catching up).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** SHA-256 of some bytes. */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  const h = [...H0];
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  h.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

/**
 * The seed for any round, worked out when it's asked for: an HMAC-SHA256 of
 * the player's secret key and `game:round`, as hex, exactly as `seedsFor` gives.
 */
export function seedFn(key: string): (game: string, round: number) => string {
  const keyBytes = new Uint8Array(key.match(/../g)!.map((h) => parseInt(h, 16)));
  const block = new Uint8Array(64);
  block.set(keyBytes.length > 64 ? sha256Bytes(keyBytes) : keyBytes);
  const ipad = block.map((b) => b ^ 0x36);
  const opad = block.map((b) => b ^ 0x5c);
  const cache = new Map<string, string>();
  return (game, round) => {
    const id = `${game}:${round}`;
    let seed = cache.get(id);
    if (!seed) {
      const msg = enc.encode(id);
      const inner = new Uint8Array(64 + msg.length);
      inner.set(ipad);
      inner.set(msg, 64);
      const outer = new Uint8Array(96);
      outer.set(opad);
      outer.set(sha256Bytes(inner), 64);
      seed = hex(sha256Bytes(outer).buffer as ArrayBuffer);
      if (cache.size > 50_000) cache.clear();
      cache.set(id, seed);
    }
    return seed;
  };
}
