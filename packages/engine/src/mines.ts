import {
  CART_BOOSTS,
  CART_TRACKS,
  cartMultiplier,
  cartRide,
  minesBoard,
  minesState,
  MINES_MAX_BOMBS,
  MINES_TILES,
  Rng,
  vaultBoard,
  VAULT_FULL,
  VAULT_PICKS,
  type MinesFind,
  type MinesTile,
} from '@idlesuits/sim';
import { autoStops, badBet, batchSize, counter, fitBet, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { amount } from './money';
import { bankOf, moveBank, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';

/** Most rounds one auto request may play. */
export const MINES_BATCH_MAX = 5;

/** A cashed-out board kept with its win: enough to dig it again exactly. */
export interface MinesReplay {
  run: string;
  round: number;
  bombs: number;
  /** The squares dug, in order. */
  digs: number[];
  /** What it cashed out at, in bets. */
  pay: number;
  bet: string;
}

/**
 * A round in play. Nothing in it is secret: the board, the cart's cave-ins
 * and the vault's shares all come from the round's seed, which stays on the
 * server until the round is over; this holds only what has been dug up.
 */
export interface MinesLive {
  round: number;
  bombs: number;
  bet: string;
  room: number;
  step: number;
  /** Squares dug, in order, and what each turned up. */
  dug: { square: number; tile: MinesTile }[];
  found: MinesFind[];
  /** A cart ride under way: the tracks taken, and the cave-in found at each junction passed. */
  ride: { picks: number[]; caves: number[]; x: number; caved: boolean; done: boolean } | null;
  /** The round is over, waiting on the Gem Vault's bonus board before it settles. */
  ended: { how: 'boom' | 'cashed'; at: number; pay: number } | null;
  bonus: { picked: number[]; shares: number[]; cash: string } | null;
}

export interface MinesProgress {
  round: number;
  /** The Gem Vault: cash set aside by every find, and the finds toward opening it. */
  vault: { cash: string; finds: number };
  live: MinesLive | null;
}

/** A finished round, settled: what the table shows at the end, the whole board included. */
export interface MinesRound extends InstantSettled {
  how: 'boom' | 'cashed';
  /** The square that blew, or -1 for a cash-out. */
  at: number;
  /** The cash-out, in bets, before the vault. */
  pay: number;
  board: MinesTile[];
  /** The vault's bonus board, if this round opened it: its shares, the picks and its cash. */
  vault: { squares: number[]; picked: number[]; cash: string; share: number } | null;
  replay: MinesReplay;
}

/** One move of a round, as the table shows it. */
export type MinesStep =
  | { kind: 'begin'; bet: string; bombs: number }
  | { kind: 'dig'; square: number; tile: MinesTile }
  | { kind: 'track'; track: number; caved: boolean; x: number; done: boolean }
  | { kind: 'open'; square: number; share: number }
  | { kind: 'cash' };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function minesProgress(state: PlayerState): MinesProgress {
  const p = progressOf(state, 'mines');
  const vault = obj(p.vault);
  const live = p.live && typeof p.live === 'object' ? (p.live as MinesLive) : null;
  return {
    round: counter(p, 'round'),
    vault: { cash: amount(vault.cash).toString(), finds: Math.min(VAULT_FULL, counter(vault, 'finds')) },
    live: live && Array.isArray(live.dug) && Array.isArray(live.found) ? live : null,
  };
}

function save(state: PlayerState, p: MinesProgress): PlayerState {
  return withProgress(state, 'mines', p as unknown as Record<string, unknown>);
}

export type MinesOutcome = { ok: true; state: PlayerState; steps: MinesStep[]; rounds: MinesRound[] } | { ok: false; error: string };

const fail = (error: string): MinesOutcome => ({ ok: false, error });

function seedOf(ctx: EngineContext, round: number) {
  return { run: ctx.seed('mines', round), round };
}

/** Stakes the bet and deals a fresh board. */
export function minesBegin(state: PlayerState, req: { bombs: number; step: number; room: number }, ctx: EngineContext): MinesOutcome {
  const p = minesProgress(state);
  if (p.live) return fail('Finish the round on the board first.');
  if (!Number.isInteger(req.bombs) || req.bombs < 1 || req.bombs > MINES_MAX_BOMBS) return fail('Bury 1 to 24 sticks.');
  const bad = badBet(req);
  if (bad) return fail(bad);
  const fit = fitBet(state, req.room, req.step, ctx);
  if (!fit) return fail('The bank can’t cover that bet.');
  // The stake leaves the bank as the round starts: a round left halfway is lost, never a free look.
  let next = moveBank(state, fit.bet.neg(), ctx.tuning);
  next = { ...next, floor: { ...next.floor, current: fit.room } };
  const live: MinesLive = { round: p.round, bombs: req.bombs, bet: fit.bet.toString(), room: fit.room, step: fit.step, dug: [], found: [], ride: null, ended: null, bonus: null };
  return { ok: true, state: save(next, { ...p, round: p.round + 1, live }), steps: [{ kind: 'begin', bet: live.bet, bombs: live.bombs }], rounds: [] };
}

/** Where a round stands: its cash-out now, and what's left to find. */
function standing(live: MinesLive, rtp: number) {
  const s = minesState(live.bombs, live.found, rtp);
  return { ...s, safeLeft: s.gemsLeft + s.starsLeft + s.cartsLeft };
}

/** Digs a square of the round in play. */
export function minesDig(state: PlayerState, square: number, ctx: EngineContext): MinesOutcome {
  const p = minesProgress(state);
  const live = p.live;
  if (!live || live.ended || live.ride) return fail('No square to dig now.');
  if (!Number.isInteger(square) || square < 0 || square >= MINES_TILES || live.dug.some((d) => d.square === square)) return fail('That square is dug.');
  const rtp = ctx.tuning.instantPayback / 100;
  const tile = minesBoard(live.bombs, seedOf(ctx, live.round))[square]!;
  const dug = [...live.dug, { square, tile }];
  const steps: MinesStep[] = [{ kind: 'dig', square, tile }];
  if (tile === 'bomb') return finish(state, { ...p, live: { ...live, dug } }, 'boom', square, 0, steps, ctx);
  // Every find drops a share of the bet into the vault.
  const vault = { cash: amount(p.vault.cash).add(amount(live.bet).mul(standing(live, rtp).vault)).toString(), finds: Math.min(VAULT_FULL, p.vault.finds + 1) };
  if (tile === 'cart') {
    // The cart rolls: the round waits on its ride.
    const next: MinesLive = { ...live, dug, ride: { picks: [], caves: [], x: 1, caved: false, done: false } };
    return { ok: true, state: save(state, { ...p, vault, live: next }), steps, rounds: [] };
  }
  const next: MinesLive = { ...live, dug, found: [...live.found, { tile }] };
  if (standing(next, rtp).safeLeft === 0) return cashOut(state, { ...p, vault, live: next }, steps, ctx);
  return { ok: true, state: save(state, { ...p, vault, live: next }), steps, rounds: [] };
}

/** The cart takes a track at its junction: a cave-in ends the ride, a clear one adds its boost. Once over, digging resumes. */
export function minesTrack(state: PlayerState, track: number, ctx: EngineContext): MinesOutcome {
  const p = minesProgress(state);
  const live = p.live;
  const ride = live?.ride;
  if (!live || !ride || ride.done) return fail('No ride under way.');
  if (!Number.isInteger(track) || track < 0 || track >= CART_TRACKS) return fail('No such tunnel.');
  const caves = cartRide(seedOf(ctx, live.round));
  const picks = [...ride.picks, track];
  const caved = caves[picks.length - 1] === track;
  const done = caved || picks.length === CART_BOOSTS.length;
  const x = cartMultiplier(caves, picks);
  const steps: MinesStep[] = [{ kind: 'track', track, caved, x, done }];
  if (!done) return { ok: true, state: save(state, { ...p, live: { ...live, ride: { picks, caves: caves.slice(0, picks.length), x, caved, done } } }), steps, rounds: [] };
  // The ride is over: its multiplier goes on the cash-out.
  const next: MinesLive = { ...live, ride: null, found: [...live.found, { tile: 'cart', cart: x }] };
  if (standing(next, ctx.tuning.instantPayback / 100).safeLeft === 0) return cashOut(state, { ...p, live: next }, steps, ctx);
  return { ok: true, state: save(state, { ...p, live: next }), steps, rounds: [] };
}

/** Cashes the round out at what it's worth now. */
export function minesCash(state: PlayerState, ctx: EngineContext): MinesOutcome {
  const p = minesProgress(state);
  const live = p.live;
  if (!live || live.ended || live.ride || !live.found.length) return fail('Nothing to cash out yet.');
  return cashOut(state, p, [], ctx);
}

function cashOut(state: PlayerState, p: MinesProgress, steps: MinesStep[], ctx: EngineContext): MinesOutcome {
  const pay = standing(p.live!, ctx.tuning.instantPayback / 100).value;
  return finish(state, p, 'cashed', -1, pay, [...steps, { kind: 'cash' }], ctx);
}

/** The round is over: it settles, or, with the vault full, waits on the vault's bonus board. */
function finish(state: PlayerState, p: MinesProgress, how: 'boom' | 'cashed', at: number, pay: number, steps: MinesStep[], ctx: EngineContext): MinesOutcome {
  const live: MinesLive = { ...p.live!, ended: { how, at, pay } };
  if (p.vault.finds >= VAULT_FULL) {
    const bonus = { picked: [], shares: [], cash: p.vault.cash };
    return { ok: true, state: save(state, { ...p, live: { ...live, bonus } }), steps, rounds: [] };
  }
  return settleMines(state, { ...p, live }, steps, ctx);
}

/** Opens a square on the vault's bonus board; the last pick pays the vault's share and settles the round. */
export function minesOpen(state: PlayerState, square: number, ctx: EngineContext): MinesOutcome {
  const p = minesProgress(state);
  const live = p.live;
  const bonus = live?.bonus;
  if (!live || !bonus) return fail('The vault isn’t open.');
  if (!Number.isInteger(square) || square < 0 || square >= MINES_TILES || bonus.picked.includes(square)) return fail('That square is open.');
  const share = vaultBoard(seedOf(ctx, live.round))[square]!;
  const next: MinesLive = { ...live, bonus: { ...bonus, picked: [...bonus.picked, square], shares: [...bonus.shares, share] } };
  const steps: MinesStep[] = [{ kind: 'open', square, share }];
  if (next.bonus!.picked.length < VAULT_PICKS) return { ok: true, state: save(state, { ...p, live: next }), steps, rounds: [] };
  return settleMines(state, { ...p, live: next, vault: { cash: '0', finds: 0 } }, steps, ctx);
}

/** Settles a finished round: the stake comes back and the round's pay (and the vault's) goes through the charms. */
function settleMines(state: PlayerState, p: MinesProgress, steps: MinesStep[], ctx: EngineContext): MinesOutcome {
  const live = p.live!;
  const ended = live.ended!;
  const bet = amount(live.bet);
  const seed = seedOf(ctx, live.round);
  const share = live.bonus ? live.bonus.shares.reduce((a, b) => a + b, 0) : 0;
  const vaultBets = live.bonus ? amount(live.bonus.cash).mul(share).div(bet).toNumber() : 0;
  const finds = live.found.length;
  const stars = live.found.filter((f) => f.tile === 'star').length;
  const carts = live.found.filter((f) => f.tile === 'cart');
  const sticks = `${live.bombs} ${live.bombs === 1 ? 'stick' : 'sticks'}`;
  const text = (ended.how === 'boom' ? 'Dynamite' : `Cashed out ${ended.pay.toFixed(2)}×`) + (live.bonus ? ' + Gem Vault' : '');
  const extras = [stars ? `${stars} ${stars === 1 ? 'star' : 'stars'}` : '', ...carts.map((c) => `cart ×${c.cart}`)].filter(Boolean);
  const sub = [`${finds} ${finds === 1 ? 'find' : 'finds'}`, ...extras, sticks].join(' · ');
  const lines: BreakdownLine[] = ended.pay > 0 ? [{ label: `Cash-out · ${finds} ${finds === 1 ? 'find' : 'finds'}, ${ended.pay.toFixed(2)}×`, amount: ended.pay }] : [];
  if (live.bonus) lines.push({ label: `Gem Vault · ${(share * 100).toFixed(0)}% of the vault`, amount: vaultBets });
  const replay: MinesReplay = { run: seed.run, round: live.round, bombs: live.bombs, digs: live.dug.map((d) => d.square), pay: ended.pay, bet: live.bet };
  // The stake went down when the round began: it comes back before the round settles its net.
  const back = moveBank(save(state, { ...p, live: null }), bet, ctx.tuning);
  const done = settleInstant(back, { game: 'mines', round: live.round, run: seed.run, room: live.room, step: live.step, bet, x: ended.pay + vaultBets, lines, text, sub, replay }, ctx);
  const round: MinesRound = {
    ...done.settled,
    how: ended.how,
    at: ended.at,
    pay: ended.pay,
    board: minesBoard(live.bombs, seed),
    vault: live.bonus ? { squares: vaultBoard(seed), picked: live.bonus.picked, cash: live.bonus.cash, share } : null,
    replay,
  };
  return { ok: true, state: done.state, steps, rounds: [round] };
}

/**
 * Auto play: whole rounds at a time, each digging `digs` squares at random,
 * then cashing out; rides and the vault's board play themselves. Every move
 * comes back, so the table can show the round as if dug by hand.
 */
export function minesAuto(state: PlayerState, req: { bombs: number; digs: number; step: number; room: number; rounds?: number; stop?: AutoStop }, ctx: EngineContext): MinesOutcome {
  if (minesProgress(state).live) return fail('Finish the round on the board first.');
  if (!Number.isInteger(req.digs) || req.digs < 1) return fail('Dig at least one square.');
  const want = batchSize(req.rounds, MINES_BATCH_MAX);
  let current = state;
  const steps: MinesStep[] = [];
  const rounds: MinesRound[] = [];
  for (let n = 0; n < want; n++) {
    const begun = minesBegin(current, req, ctx);
    if (!begun.ok) {
      if (!rounds.length) return begun;
      break;
    }
    current = begun.state;
    steps.push(...begun.steps);
    const round = minesProgress(current).live!.round;
    const pick = new Rng(ctx.seed('mines', round), 'mines-pick', round);
    const digs = Math.min(req.digs, MINES_TILES - req.bombs);
    // Moves until the round settles: dig, ride, cash out, open the vault.
    for (let guard = 0; guard < 200; guard++) {
      const live = minesProgress(current).live;
      if (!live) break;
      let out: MinesOutcome;
      if (live.bonus) {
        const free = Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => !live.bonus!.picked.includes(i));
        out = minesOpen(current, free[pick.int(free.length)]!, ctx);
      } else if (live.ride) out = minesTrack(current, pick.int(CART_TRACKS), ctx);
      else if (live.found.length >= digs) out = minesCash(current, ctx);
      else {
        const open = Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => !live.dug.some((d) => d.square === i));
        out = minesDig(current, open[pick.int(open.length)]!, ctx);
      }
      if (!out.ok) return out;
      current = out.state;
      steps.push(...out.steps);
      rounds.push(...out.rounds);
    }
    const last = rounds.at(-1);
    if (last && autoStops(req.stop, last.net, bankOf(current))) break;
  }
  return { ok: true, state: current, steps, rounds };
}

/** The round number Dynamite Dig's next board takes, and the live one's. */
export function minesRounds(state: PlayerState): { next: number; live: number | null } {
  const p = minesProgress(state);
  return { next: p.round, live: p.live?.round ?? null };
}
