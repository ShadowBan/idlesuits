import {
  BJ_BONUSES,
  decideMove,
  FREE_BET_RULES,
  handTotal,
  ruleTotal,
  solveStrategy,
  stepRound,
  type BjChoice,
  type BjEvent,
  type BjRoundResult,
  type BjRules,
  type Card,
  type Decision,
  type StrategyTables,
} from '@idlesuits/sim';
import { mainBet, outcomeOf, sideBets } from '../report';
import { equipped } from '../settle';
import { registerTable, sidesDown, type TableAdapter } from '../tables';
import { rulesFor } from '../tuning';
import { cutRange, shoeAt, shoeForRound, type ShoePlace } from './shoe';

const solved = new WeakMap<BjRules, StrategyTables>();
function tablesFor(rules: BjRules): StrategyTables {
  let t = solved.get(rules);
  if (!t) {
    t = solveStrategy(rules);
    solved.set(rules, t);
  }
  return t;
}

/** A Blackjack decision as offered: with what the bank lets the player do. */
export type BjOffer = Decision & { canInsure: boolean };

interface BjData {
  round: number;
  bonuses: Record<string, number>;
  shoe: ShoePlace;
  shuffled: boolean;
}

/** What a face-down card says about itself: nothing. */
const HIDDEN: Card = { uid: 'hole', suit: 'S', rank: 2, source: 'player' };

function describe(cards: number, total: number): string {
  return total > 21 ? 'bust' : `${total}${cards === 2 ? '' : `·${cards}`}`;
}

/**
 * Free Bet Blackjack: dealt from a six-deck shoe kept across rounds, its order
 * the engine's secret. The house pays for doubles on 9, 10 and 11 and every
 * split; a paid double or insurance puts more of the player's money down,
 * when the bank covers it. The dealer's hole card stays hidden until it's
 * turned over.
 */
export const blackjack: TableAdapter<BjOffer, BjChoice, BjEvent, BjRoundResult> = {
  game: 'blackjack',
  blindMain: 0,
  sides: () => BJ_BONUSES.map((b) => b.id),
  open(state, req, _seed, ctx) {
    const rules = rulesFor(ctx.tuning, 'blackjack', FREE_BET_RULES);
    const decks = Math.max(1, rules.decks - ruleTotal(equipped(state), 'fewerDecks'));
    const saved = (state.games.blackjack as Record<string, unknown> | undefined)?.shoe;
    const { place, shuffled } = shoeForRound('blackjack', saved, decks, ctx);
    const sides = Object.fromEntries(Object.entries(req.sides ?? {}).filter(([, v]) => Number(v) > 0).map(([id, v]) => [id, Number(v)]));
    const unit = Number(req.bet);
    const bonuses = Object.fromEntries(Object.entries(sides).map(([id, v]) => [id, v / unit]));
    const data: BjData = { round: (req as unknown as { round: number }).round, bonuses, shoe: place, shuffled };
    return { data: data as unknown as Record<string, unknown>, down: 1 + sidesDown(bonuses) };
  },
  step(raw, choices, ctx) {
    const data = raw as unknown as BjData;
    const rules = rulesFor(ctx.tuning, 'blackjack', FREE_BET_RULES);
    const shoe = shoeAt('blackjack', data.shoe, cutRange('blackjack', ctx), ctx);
    const step = stepRound({ tables: tablesFor(rules), rules, seed: { run: ctx.seed('blackjack', data.round), round: data.round }, bonuses: data.bonuses, shoe }, choices);
    return step.kind === 'done' ? step : { kind: 'decision', events: step.events, decision: { ...step.decision, canInsure: true } };
  },
  offer(decision, _data, afford, ctx) {
    if (decision.kind === 'insurance') {
      const canInsure = afford(0.5);
      return { ...decision, canInsure, suggestion: canInsure ? decision.suggestion : 'noInsurance' };
    }
    const { hand, allowed } = decision;
    if (!allowed.double || hand.bet <= 0) return decision;
    const rules = rulesFor(ctx.tuning, 'blackjack', FREE_BET_RULES);
    const total = handTotal(hand.cards);
    if (hand.cards.length === 2 && !total.soft && rules.freeDoubleTotals.includes(total.total)) return decision;
    // A paid double puts a second bet down: offered only when the bank covers it.
    if (afford(hand.bet)) return decision;
    const without = { ...allowed, double: false };
    return { ...decision, allowed: without, suggestion: decideMove(tablesFor(rules), decision.regime, hand.cards, decision.upcard, without) };
  },
  cost(decision, choice, _data) {
    if (decision.kind === 'insurance') {
      if (choice === 'noInsurance') return 0;
      return choice === 'insure' && decision.canInsure ? 0.5 : null;
    }
    if (choice === 'hit' || choice === 'stand') return 0;
    if (choice === 'split') return decision.allowed.split ? 0 : null;
    if (choice !== 'double' || !decision.allowed.double) return null;
    const total = handTotal(decision.hand.cards);
    // Free doubles are the house's money; a paid one doubles the hand's own bet.
    const free = decision.hand.cards.length === 2 && !total.soft && FREE_BET_RULES.freeDoubleTotals.includes(total.total);
    return free || decision.hand.bet <= 0 ? 0 : decision.hand.bet;
  },
  suggest(decision) {
    return decision.suggestion;
  },
  report(result, raw) {
    const data = raw as unknown as BjData;
    const mainNet = result.hands.reduce((sum, h) => sum + (h.net ?? 0), 0);
    const first = result.hands[0]!;
    return {
      report: {
        bets: [
          // The house's free money counts toward the odds a hand paid, so a free double still pays 1:1.
          ...result.hands.flatMap((h) => mainBet(h.bet + h.free, h.net ?? 0)),
          ...sideBets(result.bonuses, data.bonuses),
          ...(result.insurance === null ? [] : [{ kind: 'side' as const, stake: 0.5, net: result.insurance }]),
        ],
        outcome: outcomeOf(false, mainNet),
        blackjack: result.hands.some((h) => h.outcome === 'blackjack'),
      },
      net: result.net,
      text: result.hands.map((h) => describe(h.cards.length, handTotal(h.cards).total)).join(' / ') + ` vs ${result.dealerBlackjack ? 'BJ' : result.dealerTotal.total}`,
      sub: result.hands.length > 1 ? 'split' : (first.outcome ?? ''),
    };
  },
  redact(events) {
    // The hole card is dealt face down: its face comes with HoleCardRevealed.
    return events.map((e) => (e.type === 'CardDealt' && e.holeCard ? { ...e, card: HIDDEN } : e));
  },
  info(raw, ctx) {
    const data = raw as unknown as BjData;
    const shoe = shoeAt('blackjack', data.shoe, cutRange('blackjack', ctx), ctx);
    return { shuffled: data.shuffled, shoe: { size: shoe.cards.length, next: data.shoe.next, cut: shoe.cut } };
  },
  after(progress, raw, result) {
    const data = raw as unknown as BjData;
    return { ...progress, shoe: { ...data.shoe, next: data.shoe.next + result.cardsUsed } };
  },
};

registerTable(blackjack);
