import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { sevenCardFeatures, type SevenCardFeatures } from './evaluate';

export interface PaiGowBonusContext {
  /** The player's seven cards; how they are set does not matter to these bets. */
  cards: readonly Card[];
  /** Precomputed features of those cards, when the caller has them. */
  features?: SevenCardFeatures;
}

type Line = [label: string, pays: number, test: (f: SevenCardFeatures) => boolean];

/** A side bet that pays the first line, top down, that the seven cards make. */
function sevenCardBet(spec: Omit<BonusBet<PaiGowBonusContext>, 'rows' | 'resolve'> & { lines: Line[] }) {
  const { lines, ...rest } = spec;
  return {
    ...rest,
    rows: lines.map(([label, pays]) => ({ label, pays })),
    resolve: (ctx: PaiGowBonusContext) => {
      const f = ctx.features ?? sevenCardFeatures(ctx.cards);
      return lines.findIndex(([, , test]) => test(f));
    },
  } satisfies BonusBet<PaiGowBonusContext>;
}

/** Wizard of Odds pay table 2, "the most popular" (7.77% before envy bonuses, which need other players). */
export const PG_FORTUNE = sevenCardBet({
  id: 'fortune',
  name: 'Fortune',
  short: 'Fortune',
  blurb: 'Your seven cards, however you set them: a straight or better.',
  edge: 0.07765575,
  lines: [
    ['Seven-card straight flush', 8000, (f) => f.naturalSevenFlush],
    ['Royal flush + suited K-Q', 2000, (f) => f.royalMatch],
    ['Seven-card straight flush, with joker', 1000, (f) => f.wildSevenFlush],
    ['Five aces', 400, (f) => f.fiveAces],
    ['Royal flush', 150, (f) => f.royalFlush],
    ['Straight flush', 50, (f) => f.straightFlush],
    ['Four of a kind', 25, (f) => f.quads],
    ['Full house', 5, (f) => f.fullHouse],
    ['Flush', 4, (f) => f.flush],
    ['Three of a kind', 3, (f) => f.trips],
    ['Straight', 2, (f) => f.straight],
  ],
});

/** Wizard of Odds (4.17%): Fortune's hands, plus the worst no-pair hands. */
export const PG_EMPEROR = sevenCardBet({
  id: 'emperor',
  name: "Emperor's Challenge",
  short: 'Emperor',
  blurb: 'A straight or better in your seven cards — or a nine-, ten- or jack-high pai gow.',
  edge: 0.041714,
  lines: [
    ['Seven-card straight flush', 5000, (f) => f.naturalSevenFlush],
    ['Seven-card straight flush, with joker', 1000, (f) => f.wildSevenFlush],
    ['Five aces', 500, (f) => f.fiveAces],
    ['Royal flush', 150, (f) => f.royalFlush],
    ['Straight flush', 50, (f) => f.straightFlush],
    ['Four of a kind', 25, (f) => f.quads],
    ['Full house', 5, (f) => f.fullHouse],
    ['Flush', 4, (f) => f.flush],
    ['Three of a kind', 3, (f) => f.trips],
    ['Straight', 2, (f) => f.straight],
    ['Nine-high pai gow', 40, (f) => f.paiGowHigh === 9],
    ['Ten-high pai gow', 5, (f) => f.paiGowHigh === 10],
    ['Jack-high pai gow', 2, (f) => f.paiGowHigh === 11],
  ],
});

/** Wizard of Odds (7.35%): insurance against the dreaded pai gow, seven cards with nothing. */
export const PG_INSURANCE = sevenCardBet({
  id: 'insurance',
  name: 'Pai Gow Insurance',
  short: 'Insurance',
  blurb: 'Pays when your seven cards make no pair, straight or flush. The lower the top card, the more.',
  edge: 0.073457,
  lines: [
    ['Nine-high pai gow', 100, (f) => f.paiGowHigh === 9],
    ['Ten-high pai gow', 25, (f) => f.paiGowHigh === 10],
    ['Jack-high pai gow', 15, (f) => f.paiGowHigh === 11],
    ['Queen-high pai gow', 7, (f) => f.paiGowHigh === 12],
    ['King-high pai gow', 5, (f) => f.paiGowHigh === 13],
    ['Ace-high pai gow', 3, (f) => f.paiGowHigh === 14],
  ],
});

export const PG_BONUSES: readonly BonusBet<PaiGowBonusContext>[] = [PG_FORTUNE, PG_EMPEROR, PG_INSURANCE];
