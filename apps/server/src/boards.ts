import { amount, Decimal, type PlayerState, type RoundScores } from '@idlesuits/engine';

/** The leaderboards: the biggest single win, the best multiple of a bet, net winnings and Tokens earned. */
export const BOARDS = ['win', 'x', 'net', 'tokens'] as const;
export type Board = (typeof BOARDS)[number];

/** Running totals go to the database at most this often; a new best goes at once. */
const PUSH_EVERY_MS = 5 * 60_000;

/** One player's record on the boards for a period. */
interface Records {
  win: { money: string; text: string; game: string; at: number } | null;
  x: { x: number; text: string; game: string; at: number } | null;
  net: string;
  tokens: number;
}

/** A player's records, as their server keeps them in their state. */
export interface PlayerBoards {
  week: string;
  weekly: Records;
  all: Records;
  /** Boards changed since they last went to the database, by period. */
  dirty: { weekly: Board[]; all: Board[] };
  pushed: number;
}

const empty = (): Records => ({ win: null, x: null, net: '0', tokens: 0 });

/** The week a time falls in, by its Monday (UTC): the weekly boards' name. */
export function weekOf(now: number): string {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return `w${monday.toISOString().slice(0, 10)}`;
}

function read(raw: unknown, now: number): PlayerBoards {
  const b = raw && typeof raw === 'object' ? (raw as Partial<PlayerBoards>) : {};
  const week = weekOf(now);
  return {
    week,
    // A new week starts every weekly record afresh.
    weekly: b.week === week && b.weekly ? b.weekly : empty(),
    all: b.all ?? empty(),
    dirty: { weekly: b.week === week ? (b.dirty?.weekly ?? []) : [], all: b.dirty?.all ?? [] },
    pushed: b.pushed ?? 0,
  };
}

/** Orders amounts of any size: the amount itself while it's ordinary, its logarithm beyond. */
export function sortKey(d: Decimal): number {
  const n = d.toNumber();
  if (Number.isFinite(n) && Math.abs(n) < 1e15) return n;
  return Math.sign(n || d.sign) * (1e15 + d.abs().log10().toNumber());
}

/**
 * Counts an action's rounds on the player's records: a new biggest win or
 * best multiple, and the net and Tokens it came to (`net` and `tokens` from
 * the bank and lifetime Tokens before and after). Returns the updated
 * records, and whether something should go to the database now.
 */
export function record(before: PlayerState, after: PlayerState, scores: RoundScores, now: number): { boards: PlayerBoards; push: boolean } {
  const b = read(after.boards, now);
  const net = amount(after.bank).sub(amount(before.bank));
  const tokens = Math.max(0, after.meta.lifetimeTokens - before.meta.lifetimeTokens);
  let best = false;
  for (const period of ['weekly', 'all'] as const) {
    const r = b[period];
    const dirty = new Set(b.dirty[period]);
    if (scores.biggest && (!r.win || new Decimal(scores.biggest.money).gt(new Decimal(r.win.money)))) {
      r.win = { ...scores.biggest, at: now };
      dirty.add('win');
      best = true;
    }
    if (scores.bestX && (!r.x || scores.bestX.x > r.x.x)) {
      r.x = { ...scores.bestX, at: now };
      dirty.add('x');
      best = true;
    }
    if (!net.eq(0)) {
      r.net = new Decimal(r.net).add(net).toString();
      dirty.add('net');
    }
    if (tokens > 0) {
      r.tokens += tokens;
      dirty.add('tokens');
    }
    b.dirty[period] = [...dirty];
  }
  const pending = b.dirty.weekly.length + b.dirty.all.length > 0;
  return { boards: b, push: pending && (best || now - b.pushed >= PUSH_EVERY_MS) };
}

/** The changed records, as rows for the database; and the records marked clean. */
export function rows(b: PlayerBoards, user: { id: string; name: string }, now: number) {
  const out: { board: Board; period: string; value: string; sort: number; detail: string | null }[] = [];
  for (const period of ['weekly', 'all'] as const) {
    const r = b[period];
    const name = period === 'weekly' ? b.week : 'all';
    for (const board of b.dirty[period]) {
      if (board === 'win' && r.win) out.push({ board, period: name, value: r.win.money, sort: sortKey(new Decimal(r.win.money)), detail: `${r.win.text} · ${r.win.game}` });
      if (board === 'x' && r.x) out.push({ board, period: name, value: String(r.x.x), sort: r.x.x, detail: `${r.x.text} · ${r.x.game}` });
      if (board === 'net') out.push({ board, period: name, value: r.net, sort: sortKey(new Decimal(r.net)), detail: null });
      if (board === 'tokens') out.push({ board, period: name, value: String(r.tokens), sort: r.tokens, detail: null });
    }
  }
  return {
    rows: out.map((r) => ({ ...r, user: user.id, name: user.name, at: now })),
    clean: { ...b, dirty: { weekly: [], all: [] }, pushed: now } as PlayerBoards,
  };
}
