import {
  countOf,
  jackpotPay,
  MACHINES,
  slotCharms,
  spinSlot,
  triggerSymbol,
  waysScaleFor,
  type JackpotMeters,
  type JackpotTier,
  type MachineDef,
  type SlotSpinResult,
} from '@idlesuits/sim';
import { autoStops, badBet, batchSize, counter, fitBet, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { growJackpots, hitJackpot, JACKPOT_SEEDS, jackpotState, majorAt } from './jackpots';
import { bankOf, equipped, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';

/** Most spins one auto request may play. */
export const SLOT_BATCH_MAX = 5;

export const TIER_NAME: Record<JackpotTier, string> = { mini: 'Mini', minor: 'Minor', major: 'Major', grand: 'Grand' };

/** What the bonus is called on this machine, for banners, history and the rules. */
export function bonusName(machine: MachineDef): string {
  switch (machine.bonus.kind) {
    case 'holdSpin':
      return 'Hold & spin';
    case 'upgrade':
    case 'collect':
      return 'Free spins';
    case 'wheel':
      return 'Wheel bonus';
    case 'pick':
      return 'Jackpot pick';
  }
}

/** Every pot joined the bonus. */
export function isSuper(machine: MachineDef, lit: readonly number[]): boolean {
  const pots = machine.pots?.length ?? 0;
  return pots > 1 && lit.length === pots;
}

/** The bonus by name, Super when every pot is in it. */
export function bonusTitle(machine: MachineDef, lit: readonly number[]): string {
  const name = bonusName(machine);
  return isSuper(machine, lit) ? `Super ${name.toLowerCase()}` : name;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Every jackpot a spin won, wherever it came from. */
export function jackpotsWon(result: SlotSpinResult): JackpotTier[] {
  return [...result.collects.flatMap((c) => c.jackpots), ...(result.feature?.jackpots ?? []), ...(result.encore?.jackpots ?? [])];
}

/** The pit boss's switches for the next spin, honoured only for the pit boss. */
export interface SlotTest {
  forceFeature?: boolean;
  fillPots?: boolean;
  allCharms?: boolean;
}

export interface SlotPlay {
  machine: string;
  step: number;
  room: number;
  rounds?: number;
  stop?: AutoStop;
  test?: SlotTest;
}

/** One spin, decided: the reels, the bonus and everything they paid, for the machine to show. */
export interface SlotRound extends InstantSettled {
  machine: string;
  result: SlotSpinResult;
  /** The progressives as the spin paid them. */
  meters: JackpotMeters;
  /** The Major was due: it went to this spin. */
  mystery: boolean;
  /** Which charm did each charm thing, by name. */
  names: Partial<Record<'nudge' | 'wild' | 'fill' | 'encore', string>>;
  /** Each pot's gems after the spin. */
  pots: number[];
  /** The progressives after the spin (reset if it hit one). */
  after: InstantSettled['after'] & { meters: JackpotMeters };
}

export type SlotOutcome = { ok: true; state: PlayerState; rounds: SlotRound[] } | { ok: false; error: string };

export function findMachine(id: string): MachineDef | undefined {
  return MACHINES.find((m) => m.id === id);
}

/** A machine's pots as it holds them between spins, at any bet. */
export function potsOf(state: PlayerState, machine: MachineDef): number[] {
  const saved = progressOf(state, machine.id).pots;
  return (machine.pots ?? []).map((def, i) => {
    const n = Array.isArray(saved) ? Number(saved[i]) : 0;
    return Number.isInteger(n) ? Math.min(def.size, Math.max(0, n)) : 0;
  });
}

export function slotRound(state: PlayerState, machine: string): number {
  return counter(progressOf(state, machine), 'round');
}

/** The spin's lines for the breakdown, in bets. */
function linesFor(machine: MachineDef, result: SlotSpinResult, meters: JackpotMeters, mystery: boolean, names: SlotRound['names']): BreakdownLine[] {
  const lines: BreakdownLine[] = [{ label: 'Spin', amount: -1 }];
  if (result.wins.length) {
    const n = result.wins.reduce((sum, w) => sum + w.ways, 0);
    lines.push({ label: `Ways · ${plural(n, 'way')}`, amount: result.waysPay });
  }
  const baseJackpots = result.collects.flatMap((c) => c.jackpots);
  if (result.collects.length) {
    const won = baseJackpots.reduce((sum, t) => sum + jackpotPay(machine, t, meters), 0);
    lines.push({ label: `Collected · ${plural(result.coins.length, 'coin')}`, amount: result.collectPay - won });
  }
  // The bonus, and again if a charm brought it back.
  for (const [f, again] of [
    [result.feature, false],
    [result.encore, true],
  ] as const) {
    if (!f) continue;
    const won = f.jackpots.reduce((sum, t) => sum + jackpotPay(machine, t, meters), 0);
    const name = again ? `${names.encore ?? 'Charm'} · ${bonusTitle(machine, result.lit).toLowerCase()} again` : bonusTitle(machine, result.lit);
    const label =
      f.kind === 'holdSpin'
        ? `${name} · ${plural(f.coins.length, 'coin')}`
        : f.kind === 'freeSpins'
          ? `${name} · ${f.spins.length}`
          : f.kind === 'wheel' && f.rounds.length > 1
            ? `${name} · twice`
            : name;
    if (f.kind !== 'pick') lines.push({ label, amount: f.pay - won });
    for (const tier of f.jackpots) lines.push({ label: `${TIER_NAME[tier]} jackpot`, amount: jackpotPay(machine, tier, meters) });
  }
  for (const tier of baseJackpots) lines.push({ label: `${TIER_NAME[tier]} jackpot`, amount: jackpotPay(machine, tier, meters) });
  if (mystery) lines.push({ label: 'Must-hit Major', amount: meters.major });
  return lines;
}

/** What the wins list and history call a spin. */
function describe(machine: MachineDef, result: SlotSpinResult, mystery: boolean): { text: string; sub: string } {
  const top = [...result.wins].sort((a, b) => b.pay - a.pay)[0];
  const name = top ? machine.symbols.find((s) => s.id === top.symbol)!.name : '';
  const f = result.feature;
  const text = mystery
    ? 'Must-hit Major'
    : f
      ? f.kind === 'pick'
        ? f.boards.map((b) => TIER_NAME[b.won]).join(' + ') + (f.boards.length > 1 ? ' jackpots' : ' jackpot')
        : bonusTitle(machine, result.lit)
      : top
        ? `${top.reels} ${name}`
        : 'Captain’s haul';
  const sub = f
    ? f.kind === 'holdSpin'
      ? plural(f.coins.length, 'coin')
      : f.kind === 'freeSpins'
        ? plural(f.spins.length, 'spin')
        : f.kind === 'wheel'
          ? f.rounds.map((r) => `wheel ${r.stops.length}`).join(' + ')
          : plural(f.boards.reduce((n, b) => n + b.picks.length, 0), 'pick')
    : result.collects.length
      ? plural(result.coins.length, 'coin')
      : plural(result.wins.length, 'win');
  return { text, sub };
}

/** Each machine's way-pay scale at a payback: a search that takes up to a second, so it's worked out once. */
const scales = new Map<string, number>();
export function slotScale(machine: MachineDef, payback: number): number {
  const key = `${machine.id}|${payback}`;
  let scale = scales.get(key);
  if (scale === undefined) {
    scale = waysScaleFor(machine, payback);
    scales.set(key, scale);
  }
  return scale;
}

const ALL_CHARMS = { charms: { nudge: 1, wild: 1, fill: 1, encore: 1 }, names: { nudge: 'Pit boss', wild: 'Pit boss', fill: 'Pit boss', encore: 'Pit boss' } };

function spinOnce(state: PlayerState, machine: MachineDef, play: SlotPlay, test: SlotTest, ctx: EngineContext): { state: PlayerState; round: SlotRound } | null {
  const fit = fitBet(state, play.room, play.step, ctx);
  if (!fit) return null;
  const round = slotRound(state, machine.id);
  const run = ctx.seed(machine.id, round);
  // The meters as the reels start: this spin pays what they showed. The shared ones for a member, or the player's own.
  const link = ctx.link;
  let next = link ? state : growJackpots(state, ctx, false);
  const j = jackpotState(next);
  const meters = link ? { ...link.meters } : { major: j.major, grand: j.grand };
  const pots = test.fillPots && machine.pots ? machine.pots.map((p) => p.size) : potsOf(next, machine);
  const charms = test.allCharms ? ALL_CHARMS : slotCharms(equipped(next));
  const result = spinSlot({
    machine,
    seed: { run, round },
    waysScale: slotScale(machine, ctx.tuning.slotPayback / 100),
    meters,
    forceFeature: test.forceFeature,
    pots,
    charms: charms.charms,
  });
  // The Major past its hidden point goes to this spin, unless the spin wins it anyway.
  const won = jackpotsWon(result);
  const mystery = (link ? link.due : j.major >= majorAt(j, ctx)) && !won.includes('major');
  const x = result.pay + (mystery ? meters.major : 0);
  const { text, sub } = describe(machine, result, mystery);
  next = withProgress(next, machine.id, { ...progressOf(next, machine.id), round: round + 1, pots: result.pots });
  const lines = linesFor(machine, result, meters, mystery, charms.names);
  const done = settleInstant(
    next,
    {
      game: machine.id,
      round,
      run,
      room: fit.room,
      step: fit.step,
      bet: fit.bet,
      x,
      lines: lines.slice(1),
      text,
      sub,
      replay: undefined,
      extra: {
        // For the slot charms: gems into the pots, and a spin one short of the bonus.
        gems: result.gems.length,
        nearMiss: !result.feature && countOf(result.grid, triggerSymbol(machine)) === machine.bonus.trigger - 1,
        // For Lucky Stars: the bonus, and any progressive.
        feats: [...(result.feature ? ['bonus'] : []), ...(won.length || mystery ? ['jackpot'] : [])],
      },
      betLabel: 'Spin',
    },
    ctx,
  );
  // Whoever hits a progressive starts it over, for every machine on the floor (after the spin's own share went in).
  let settled = done.state;
  for (const tier of [...won, ...(mystery ? ['major' as const] : [])]) {
    if (tier !== 'major' && tier !== 'grand') continue;
    const at = meters[tier];
    const claim = { tier, x: at, paid: fit.bet.mul(at).toString(), machine: machine.name, mystery: mystery && tier === 'major' };
    if (link) {
      // Reported to the shared jackpot, which starts it over for everyone; this action plays on from its seed.
      link.claims.push(claim);
      link.meters = { ...link.meters, [tier]: JACKPOT_SEEDS[tier] };
      if (tier === 'major') link.due = false;
    } else settled = hitJackpot(settled, claim, ctx);
  }
  const after = link ? link.meters : jackpotState(settled);
  return {
    state: settled,
    round: {
      ...done.settled,
      machine: machine.id,
      result,
      meters,
      mystery,
      names: charms.names,
      pots: result.pots,
      after: { ...done.settled.after, meters: { major: after.major, grand: after.grand } },
    },
  };
}

/**
 * Spins a machine: once, or up to SLOT_BATCH_MAX times for auto play. Each
 * spin is decided whole, bonus and all (a pick bonus's picks are the
 * machine's; which tiles the player taps is only how they're shown).
 */
export function playSlot(state: PlayerState, play: SlotPlay, ctx: EngineContext, admin: boolean): SlotOutcome {
  const machine = findMachine(play.machine);
  if (!machine) return { ok: false, error: 'No such machine.' };
  const bad = badBet(play);
  if (bad) return { ok: false, error: bad };
  const want = batchSize(play.rounds, SLOT_BATCH_MAX);
  const rounds: SlotRound[] = [];
  let current = state;
  for (let i = 0; i < want; i++) {
    // The pit boss's switches act on the first spin only.
    const test = admin && i === 0 ? (play.test ?? {}) : {};
    const done = spinOnce(current, machine, play, test, ctx);
    if (!done) break;
    current = done.state;
    rounds.push(done.round);
    if (autoStops(play.stop, done.round.net, bankOf(current))) break;
  }
  if (!rounds.length) return { ok: false, error: 'The bank can’t cover that bet.' };
  return { ok: true, state: current, rounds };
}
