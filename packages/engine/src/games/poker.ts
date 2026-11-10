import {
  BLIND,
  C4P_BONUSES,
  C4P_RULES,
  CSP_BONUSES,
  CSP_RULES,
  decideC4p,
  decideCsp,
  decideDj,
  decideLir,
  decideStud,
  decideTcp,
  decideUth,
  DJ_BONUSES,
  DJ_CATEGORY_NAMES,
  DJ_RULES,
  djCategoryOf,
  FOUR_CARD_NAMES,
  fourCategoryOf,
  handName,
  isLegalSet,
  LIR_BONUSES,
  LIR_RULES,
  PAI_GOW_RULES,
  PG_BONUSES,
  pgCategoryOf,
  pgHandName,
  PREFLOP_CHART,
  simulateC4pRound,
  simulateCspRound,
  simulateDjRound,
  simulateLirRound,
  simulatePaiGowRound,
  simulateStudRound,
  simulateTcpRound,
  simulateUthRound,
  standardDeck,
  stepWithChoices,
  STUD_BONUSES,
  STUD_RULES,
  TCP_BONUSES,
  TCP_RULES,
  THREE_CARD_NAMES,
  UTH_BONUSES,
  UTH_RULES,
  type C4pChoice,
  type C4pDecision,
  type Card,
  type PaiGowDecision,
  type PaiGowSet,
  type PokerHand,
  type RoundReport,
  type Seat,
  type StudChoice,
  type StudDecision,
  type UthDecision,
  type UthMove,
} from '@idlesuits/sim';
import { mainBet, outcomeOf, sideBets } from '../report';
import { registerTable, sidesDown, type TableAdapter } from '../tables';
import { rulesFor, type EngineTuning } from '../tuning';

const SHORT = ['High', 'Pair', '2 pair', 'Trips', 'Straight', 'Flush', 'Full', 'Quads', 'Str flush', 'Royal'];
const short = (hand: PokerHand | undefined | null) => (hand ? SHORT[hand.category]! : '');

/** What every poker table's round data holds. */
interface PokerData {
  round: number;
  /** Side bets, in units of the main bet. */
  bonuses: Record<string, number>;
  /** The player's seat among the hands at the table: the blind hands sit before it. */
  seat: Seat;
}

/** One poker table, as the factory below makes it into an adapter. */
interface PokerSpec<R, D, C, Rules extends object> {
  game: string;
  /** What the charms and lifetime stats call the game, if not its table id. */
  statsId?: string;
  base: Rules;
  bonusIds: readonly string[];
  /** Main bets a blind hand plays all in, in units. */
  blindMain: number;
  /** Main-bet units down at the deal (sides aside), and units the bank must also cover for a call the hand can't refuse to afford. */
  down(rules: Rules): number;
  reserve?(rules: Rules): number;
  /** Cards a hand holds face down, for a blind seat before it's turned over. */
  holeCards: number;
  simulate(input: { rules: Rules; seed: { run: string; round: number }; seat: Seat; bonuses: Record<string, number>; decide: (d: D) => C; onEvent?: (e: unknown) => void }): R;
  blindDecide: (d: D) => C;
  /** The decision with only the choices the bank covers (`afford(units)`). */
  offer?(d: D, afford: (units: number) => boolean, rules: Rules): D;
  /** Units a choice puts down, or null if it isn't open. */
  cost(d: D, c: C, rules: Rules): number | null;
  suggest(d: D, rules: Rules): C;
  report(r: R, sides: Record<string, number>, rules: Rules): Omit<RoundReport, 'game' | 'seed'>;
  /** The hand on a blind seat once turned: its cards and what it made. */
  show(r: R): { cards: Card[]; label: string };
  text(r: R): { text: string; sub: string };
  net(r: R): number;
}

function poker<R, D, C, Rules extends object>(spec: PokerSpec<R, D, C, Rules>): TableAdapter<D, C, unknown, R> {
  const rulesOf = (t: EngineTuning) => rulesFor(t, spec.game, spec.base);
  return {
    game: spec.game,
    statsId: spec.statsId,
    blindMain: spec.blindMain,
    holeCards: spec.holeCards,
    sides: () => spec.bonusIds,
    open(_state, req, _seed, ctx, seat) {
      const rules = rulesOf(ctx.tuning);
      const unit = Number(req.bet);
      const bonuses = Object.fromEntries(
        Object.entries(req.sides ?? {})
          .filter(([, v]) => Number(v) > 0)
          .map(([id, v]) => [id, Number(v) / unit]),
      );
      const data: PokerData = { round: (req as unknown as { round: number }).round, bonuses, seat };
      return { data: data as unknown as Record<string, unknown>, down: spec.down(rules) + sidesDown(bonuses), reserve: spec.reserve?.(rules) ?? 0 };
    },
    step(raw, choices, ctx) {
      const data = raw as unknown as PokerData;
      const rules = rulesOf(ctx.tuning);
      const seed = { run: ctx.seed(spec.game, data.round), round: data.round };
      return stepWithChoices<D, C, unknown, R>((decide, onEvent) => spec.simulate({ rules, seed, seat: data.seat, bonuses: data.bonuses, decide, onEvent }), choices);
    },
    blindHand(raw, sides, seat, ctx) {
      const data = raw as unknown as PokerData;
      const rules = rulesOf(ctx.tuning);
      const seed = { run: ctx.seed(spec.game, data.round), round: data.round };
      const r = spec.simulate({ rules, seed, seat, bonuses: sides, decide: spec.blindDecide });
      const show = spec.show(r);
      return { show, label: show.label, net: spec.net(r), report: spec.report(r, sides, rules) };
    },
    offer(d, _data, afford, ctx) {
      return spec.offer ? spec.offer(d, afford, rulesOf(ctx.tuning)) : d;
    },
    cost(d, c, _data) {
      // The rules a cost reads (a raise's size) are the table's as designed or tuned; the decision carries what varies.
      return spec.cost(d, c, spec.base);
    },
    suggest(d, _data, ctx) {
      return spec.suggest(d, rulesOf(ctx.tuning));
    },
    report(r, raw) {
      const data = raw as unknown as PokerData;
      return { report: spec.report(r, data.bonuses, spec.base), net: spec.net(r), ...spec.text(r) };
    },
  };
}

// Ultimate Texas Hold'em: ante and blind down; a 4×/3× play before the flop, 2× on it, 1× on the river.
const UTH_DECK = standardDeck('player');
const UTH_STRATEGY = { chart: PREFLOP_CHART };
type UthChoice = { move: UthMove; raise?: number };
registerTable(
  poker<ReturnType<typeof simulateUthRound>, UthDecision, UthChoice, typeof UTH_RULES>({
    game: 'uth',
    base: UTH_RULES,
    bonusIds: UTH_BONUSES.map((b) => b.id),
    blindMain: 6,
    holeCards: 2,
    down: () => 2,
    simulate: (i) => simulateUthRound({ ...i, decide: i.decide, onEvent: i.onEvent as never }),
    blindDecide: BLIND.uth,
    offer: (d, afford) => ({ ...d, raises: d.raises.filter((r) => afford(r)) }),
    cost(d, c) {
      if (c?.move === 'raise') return typeof c.raise === 'number' && d.raises.includes(c.raise) ? c.raise : null;
      if (c?.move === 'check') return d.canCheck ? 0 : null;
      if (c?.move === 'fold') return d.canFold ? 0 : null;
      return null;
    },
    suggest(d) {
      const s = decideUth(UTH_STRATEGY, d, UTH_DECK);
      if (s.move === 'raise' && (!d.raises.length || !d.raises.includes(s.raise!))) return d.raises.length ? { move: 'raise', raise: Math.max(...d.raises) } : { move: d.canCheck ? 'check' : 'fold' };
      return s;
    },
    report: (r, sides) => ({
      bets: [...mainBet(1, r.parts.ante), ...mainBet(1, r.parts.blind), ...mainBet(r.play, r.parts.play), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.play),
      tier: r.playerHand.category,
    }),
    show: (r) => ({ cards: r.hole, label: short(r.playerHand) }),
    text: (r) => ({ text: r.folded ? 'Fold' : `${short(r.playerHand)} vs ${short(r.dealerHand)}`, sub: r.folded ? 'folded' : r.dealerQualified ? 'dealer opened' : 'dealer didn’t open' }),
    net: (r) => r.net,
  }),
);

// Three Card Poker: the ante down; playing puts down 1× more.
registerTable(
  poker<ReturnType<typeof simulateTcpRound>, { cards: Card[] }, 'play' | 'fold', typeof TCP_RULES>({
    game: 'tcp',
    base: TCP_RULES,
    bonusIds: TCP_BONUSES.map((b) => b.id),
    blindMain: 2,
    holeCards: 3,
    down: () => 1,
    reserve: () => 1,
    simulate: (i) => simulateTcpRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.tcp,
    cost: (_d, c) => (c === 'play' ? 1 : c === 'fold' ? 0 : null),
    suggest: (d) => decideTcp(d.cards),
    report: (r, sides) => ({
      bets: [
        ...mainBet(1, r.parts.ante),
        ...mainBet(r.folded ? 0 : 1, r.parts.play),
        ...(r.parts.anteBonus > 0 ? mainBet(1, r.parts.anteBonus) : []),
        ...sideBets(r.bonuses, sides),
      ],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.play),
      tier: ({ high: 0, pair: 1, straight: 4, flush: 5, trips: 3, straightFlush: 8, miniRoyal: 9 } as const)[r.playerHand],
    }),
    show: (r) => ({ cards: r.player, label: THREE_CARD_NAMES[r.playerHand] }),
    text: (r) => ({ text: r.folded ? 'Fold' : `${THREE_CARD_NAMES[r.playerHand]} vs ${THREE_CARD_NAMES[r.dealerHand]}`, sub: r.folded ? 'folded' : r.qualified ? 'dealer qualified' : 'dealer didn’t qualify' }),
    net: (r) => r.net,
  }),
);

// Caribbean Stud: the ante down; raising puts down the raise (2×).
registerTable(
  poker<ReturnType<typeof simulateCspRound>, { cards: Card[]; upcard: Card }, 'raise' | 'fold', typeof CSP_RULES>({
    game: 'csp',
    base: CSP_RULES,
    bonusIds: CSP_BONUSES.map((b) => b.id),
    blindMain: 3,
    holeCards: 5,
    down: () => 1,
    reserve: (rules) => rules.raise,
    simulate: (i) => simulateCspRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.csp,
    cost: (_d, c, rules) => (c === 'raise' ? rules.raise : c === 'fold' ? 0 : null),
    suggest: (d) => decideCsp(d.cards, d.upcard),
    report: (r, sides, rules) => ({
      bets: [...mainBet(1, r.parts.ante), ...mainBet(r.folded ? 0 : rules.raise, r.parts.raise), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.raise),
      tier: r.playerHand.category,
    }),
    show: (r) => ({ cards: r.player, label: short(r.playerHand) }),
    text: (r) => ({ text: r.folded ? 'Fold' : `${short(r.playerHand)} vs ${short(r.dealerHand)}`, sub: r.folded ? 'folded' : r.qualified ? 'dealer qualified' : 'dealer didn’t qualify' }),
    net: (r) => r.net,
  }),
);

// Crazy 4 Poker: the ante and the Super Bonus down; a play of 1×, or 3× with aces or better.
registerTable(
  poker<ReturnType<typeof simulateC4pRound>, C4pDecision, C4pChoice, typeof C4P_RULES>({
    game: 'c4p',
    base: C4P_RULES,
    bonusIds: C4P_BONUSES.map((b) => b.id),
    blindMain: 5,
    holeCards: 5,
    down: () => 2,
    simulate: (i) => simulateC4pRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.c4p,
    offer: (d, afford) => ({ ...d, sizes: d.sizes.filter((s) => afford(s)) }),
    cost: (d, c) => (c?.move === 'fold' ? 0 : c?.move === 'play' && d.sizes.includes(c.size) ? c.size : null),
    suggest(d, rules) {
      const s = decideC4p(d.cards, rules.bigPlay);
      if (s.move === 'play' && !d.sizes.includes(s.size)) return d.sizes.length ? { move: 'play', size: Math.max(...d.sizes) } : { move: 'fold' };
      return s;
    },
    report: (r, sides) => ({
      bets: [...mainBet(1, r.parts.ante), ...mainBet(r.play, r.parts.play), ...mainBet(1, r.parts.superBonus), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.play),
      tier: [0, 1, 2, 4, 5, 3, 8, 7][fourCategoryOf(r.playerScore)],
    }),
    show: (r) => ({ cards: r.player, label: FOUR_CARD_NAMES[fourCategoryOf(r.playerScore)] }),
    text: (r) => ({ text: r.folded ? 'Fold' : `${FOUR_CARD_NAMES[fourCategoryOf(r.playerScore)]} vs ${FOUR_CARD_NAMES[fourCategoryOf(r.dealerScore)]}`, sub: r.folded ? 'folded' : `play ${r.play}×` }),
    net: (r) => r.net,
  }),
);

// Mississippi Stud: the ante down; a bet of 1× to 3× on each of three streets, keeping 1× back for every street to come.
registerTable(
  poker<ReturnType<typeof simulateStudRound>, StudDecision, StudChoice, typeof STUD_RULES>({
    game: 'stud',
    base: STUD_RULES,
    bonusIds: STUD_BONUSES.map((b) => b.id),
    blindMain: 10,
    holeCards: 2,
    down: () => 1,
    simulate: (i) => simulateStudRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.stud,
    offer: (d, afford) => ({ ...d, raises: d.raises.filter((r) => afford(r + (5 - d.street))) }),
    cost: (d, c) => (c?.move === 'fold' ? 0 : c?.move === 'bet' && d.raises.includes(c.size) ? c.size : null),
    suggest(d) {
      const s = decideStud(d);
      if (s.move === 'bet' && !d.raises.includes(s.size)) {
        const fits = d.raises.filter((r) => r <= s.size);
        return fits.length ? { move: 'bet', size: Math.max(...fits) } : { move: 'fold' };
      }
      return s;
    },
    report: (r, sides) => ({
      bets: [...[1, ...r.bets].flatMap((stake) => mainBet(stake, r.folded ? -stake : stake * (r.multiplier ?? -1))), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(r.folded, r.multiplier ?? -1),
      tier: r.hand?.category,
    }),
    show: (r) => ({ cards: r.hole, label: r.hand ? short(r.hand) : '' }),
    text: (r) => ({ text: r.folded ? 'Fold' : short(r.hand), sub: r.folded ? 'folded' : `${[1, ...r.bets].reduce((a, b) => a + b, 0)}× down` }),
    net: (r) => r.net,
  }),
);

// Let It Ride: three bets down; the first two can be pulled back, which costs nothing more.
registerTable(
  poker<ReturnType<typeof simulateLirRound>, { bet: 1 | 2; cards: Card[] }, 'ride' | 'pull', typeof LIR_RULES>({
    game: 'lir',
    base: LIR_RULES,
    bonusIds: LIR_BONUSES.map((b) => b.id),
    blindMain: 3,
    holeCards: 3,
    down: () => 3,
    simulate: (i) => simulateLirRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.lir,
    cost: (_d, c) => (c === 'ride' || c === 'pull' ? 0 : null),
    suggest: (d) => decideLir(d.cards),
    report: (r, sides) => ({
      bets: [...r.riding.flatMap((up) => mainBet(up ? 1 : 0, r.multiplier)), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(false, r.multiplier),
      tier: r.hand.category,
    }),
    show: (r) => ({ cards: r.hole, label: handName(r.hand) }),
    text: (r) => ({ text: handName(r.hand), sub: `${r.riding.filter(Boolean).length} riding` }),
    net: (r) => r.net,
  }),
);

// Deuces Wild hold'em-style: the ante and the blind down; playing puts down the play (2×).
registerTable(
  poker<ReturnType<typeof simulateDjRound>, { cards: Card[] }, 'play' | 'fold', typeof DJ_RULES>({
    game: 'djwild',
    statsId: 'djw',
    base: DJ_RULES,
    bonusIds: DJ_BONUSES.map((b) => b.id),
    blindMain: 4,
    holeCards: 5,
    down: () => 2,
    reserve: (rules) => rules.play,
    simulate: (i) => simulateDjRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.djw,
    cost: (_d, c, rules) => (c === 'play' ? rules.play : c === 'fold' ? 0 : null),
    suggest: (d) => decideDj(d.cards),
    report: (r, sides, rules) => ({
      bets: [...mainBet(1, r.parts.ante), ...mainBet(1, r.parts.blind), ...mainBet(r.folded ? 0 : rules.play, r.parts.play), ...sideBets(r.bonuses, sides)],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.play),
      tier: Math.min(9, djCategoryOf(r.playerScore)),
    }),
    show: (r) => ({ cards: r.player, label: DJ_CATEGORY_NAMES[djCategoryOf(r.playerScore)] }),
    text: (r) => ({
      text: r.folded ? 'Fold' : `${DJ_CATEGORY_NAMES[djCategoryOf(r.playerScore)]} vs ${DJ_CATEGORY_NAMES[djCategoryOf(r.dealerScore)]}`,
      sub: r.folded ? 'folded' : 'played',
    }),
    net: (r) => r.net,
  }),
);

// Pai Gow Poker: the bet down; the player sets their seven cards, any legal way.
registerTable(
  poker<ReturnType<typeof simulatePaiGowRound>, PaiGowDecision, PaiGowSet, typeof PAI_GOW_RULES>({
    game: 'paigow',
    base: PAI_GOW_RULES,
    bonusIds: PG_BONUSES.map((b) => b.id),
    blindMain: 1,
    holeCards: 7,
    down: () => 1,
    simulate: (i) => simulatePaiGowRound({ ...i, onEvent: i.onEvent as never }),
    blindDecide: BLIND.paigow,
    cost: (d, c) =>
      c && Array.isArray(c.low) && c.low.length === 2 && c.low.every((n) => Number.isInteger(n)) && isLegalSet(d.cards, { low: [c.low[0]!, c.low[1]!] }) ? 0 : null,
    suggest: (d) => d.suggestion,
    report: (r, sides) => ({ bets: [...mainBet(1, r.main), ...sideBets(r.bonuses, sides)], outcome: r.outcome, tier: Math.min(9, pgCategoryOf(r.playerSet.highScore)) }),
    show: (r) => ({ cards: r.player, label: pgHandName(r.playerSet.highScore) }),
    text: (r) => ({ text: pgHandName(r.playerSet.highScore), sub: r.outcome }),
    net: (r) => r.net,
  }),
);
