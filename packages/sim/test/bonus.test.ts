import { describe, expect, it } from 'vitest';
import {
  BJ_POT_OF_GOLD,
  BJ_PUSH_22,
  decideStud,
  evaluatePoker,
  FREE_BET_RULES,
  handTotal,
  simulateBjRound,
  simulateStudRound,
  solveStrategy,
  STUD_THREE_CARD,
  threeCardHand,
  UTH_BAD_BEAT,
  UTH_HOLE_CARD,
  UTH_SIX_CARD,
  UTH_TRIPS,
  type Card,
  type Suit,
  type UthBonusContext,
} from '../src';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const cards = (spec: string): Card[] =>
  spec.split(' ').map((c, i) => ({
    uid: `t${i}${c}`,
    rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
    suit: c.slice(-1) as Suit,
    source: 'player' as const,
  }));

/** A UTH table from hole, dealer, board and bonus cards. */
function uth(hole: string, dealer: string, board = '2C 7D 9H JS 4C', bonus = '3S 8D TC 5H'): UthBonusContext {
  const h = cards(hole);
  const d = cards(dealer);
  const b = cards(board);
  return {
    hole: h,
    dealer: d,
    board: b,
    bonusCards: cards(bonus),
    playerHand: evaluatePoker([...h, ...b]),
    dealerHand: evaluatePoker([...d, ...b]),
  };
}
const label = (bet: { rows: readonly { label: string }[] }, row: number) => (row < 0 ? 'loses' : bet.rows[row]!.label);

describe('Ultimate Texas Hold’em side bets', () => {
  it('Trips pays on the player’s best five of seven', () => {
    expect(label(UTH_TRIPS, UTH_TRIPS.resolve(uth('9S 9D', 'KS KD')))).toBe('Three of a kind');
    expect(label(UTH_TRIPS, UTH_TRIPS.resolve(uth('AS AD', 'KS KD')))).toBe('loses');
    expect(label(UTH_TRIPS, UTH_TRIPS.resolve(uth('8C TD', '2S 3S')))).toBe('Straight');
  });

  it('the 6-Card Bonus uses the hole cards and the four bonus cards, not the board', () => {
    expect(label(UTH_SIX_CARD, UTH_SIX_CARD.resolve(uth('3D 3C', 'KS KD')))).toBe('Three of a kind');
    expect(label(UTH_SIX_CARD, UTH_SIX_CARD.resolve(uth('9S 9D', 'KS KD')))).toBe('loses');
    const royal = uth('AS KS', '2D 3D', '2C 7D 9H JD 4C', 'QS JS TS 4D');
    expect(label(UTH_SIX_CARD, UTH_SIX_CARD.resolve(royal))).toBe('Royal flush');
  });

  it('the Hole Card Bonus reads the two hole cards, and aces against aces', () => {
    const cases: [string, string, string][] = [
      ['AS AD', 'AC AH', 'Aces, and the dealer has aces'],
      ['AS AD', 'KC AH', 'Pair of aces'],
      ['AS KS', '2C 3H', 'A-K suited'],
      ['AH JH', '2C 3H', 'A-Q or A-J suited'],
      ['AS KD', '2C 3H', 'A-K'],
      ['JS JD', '2C 3H', 'Pair of jacks to kings'],
      ['QS AD', '2C 3H', 'A-Q or A-J'],
      ['TS TD', '2C 3H', 'Pair of 2s to 10s'],
      ['AS TS', '2C 3H', 'loses'],
      ['KS QS', '2C 3H', 'loses'],
    ];
    for (const [hole, dealer, expected] of cases) {
      expect(label(UTH_HOLE_CARD, UTH_HOLE_CARD.resolve(uth(hole, dealer))), hole).toBe(expected);
    }
  });

  it('Bad Beat pays on the losing hand, whoever holds it, and ties lose', () => {
    // Player trips of nines lose to the dealer's trips of kings.
    expect(label(UTH_BAD_BEAT, UTH_BAD_BEAT.resolve(uth('9S 9D', 'KS KD', '9C KC 2H 5S 7D')))).toBe(
      'Three of a kind',
    );
    // The dealer's flush loses to the player's full house.
    const dealerLoses = uth('KS KD', 'AC 3C', 'KC 8C 8H 5C 2D');
    expect(label(UTH_BAD_BEAT, UTH_BAD_BEAT.resolve(dealerLoses))).toBe('Flush');
    // Both play the board's straight: a tie, which loses.
    expect(label(UTH_BAD_BEAT, UTH_BAD_BEAT.resolve(uth('2S 3D', '2C 3H', '9C TD JH QS KD')))).toBe('loses');
    // A losing pair is not enough.
    expect(label(UTH_BAD_BEAT, UTH_BAD_BEAT.resolve(uth('2S 3D', 'AC AH')))).toBe('loses');
  });
});

describe('Mississippi Stud 3-Card Bonus', () => {
  it('ranks three-card hands, with a straight above a flush and no K-A-2', () => {
    expect(threeCardHand(cards('AS KS QS'))).toBe('miniRoyal');
    expect(threeCardHand(cards('AS 2S 3S'))).toBe('straightFlush');
    expect(threeCardHand(cards('7D 7C 7H'))).toBe('trips');
    expect(threeCardHand(cards('QD KC AH'))).toBe('straight');
    expect(threeCardHand(cards('KD AC 2H'))).toBe('high');
    expect(threeCardHand(cards('2D 9D JD'))).toBe('flush');
    expect(threeCardHand(cards('2D 2C JD'))).toBe('pair');
  });

  it('counts every three-card hand the published way', () => {
    const deck: Card[] = [];
    for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) for (let rank = 2; rank <= 14; rank++) deck.push(...cards(`${rank}${suit}`));
    const counts: Record<string, number> = {};
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++) {
          const hand = threeCardHand([deck[a]!, deck[b]!, deck[c]!]);
          counts[hand] = (counts[hand] ?? 0) + 1;
        }
    expect(counts).toEqual({ miniRoyal: 4, straightFlush: 44, trips: 52, straight: 720, flush: 1096, pair: 3744, high: 16440 });
    const ev = STUD_THREE_CARD.rows.reduce((sum, row, i) => sum + row.pays * counts[['miniRoyal', 'straightFlush', 'trips', 'straight', 'flush', 'pair'][i]!]!, 0);
    expect((ev - counts.high!) / 22100).toBeCloseTo(-STUD_THREE_CARD.edge, 10);
  });

  it('settles on the community cards even after a fold, and reveals them', () => {
    let folds = 0;
    for (let round = 0; round < 2000; round++) {
      const seed = { run: 'stud-bonus', round };
      const plain = simulateStudRound({ seed, decide: decideStud });
      const r = simulateStudRound({ seed, decide: decideStud, bonuses: { threeCard: 1 }, recordEvents: true });
      const row = STUD_THREE_CARD.resolve({ hole: r.hole, community: r.community });
      expect(r.bonuses).toEqual([{ id: 'threeCard', row, net: row < 0 ? -1 : STUD_THREE_CARD.rows[row]!.pays }]);
      expect(r.net).toBe(plain.net + r.bonuses[0]!.net);
      if (r.folded) {
        folds++;
        expect(r.events.filter((e) => e.type === 'CommunityCard')).toHaveLength(3);
      }
    }
    expect(folds).toBeGreaterThan(500);
  });
});

describe('Free Bet Blackjack side bets', () => {
  const tables = solveStrategy(FREE_BET_RULES);

  it('Pot of Gold counts free splits and free doubles', () => {
    const ctx = (freeBets: number) => ({ freeBets, dealer: [], dealerTotal: handTotal([]), dealerBlackjack: false });
    expect(label(BJ_POT_OF_GOLD, BJ_POT_OF_GOLD.resolve(ctx(0)))).toBe('loses');
    expect(label(BJ_POT_OF_GOLD, BJ_POT_OF_GOLD.resolve(ctx(1)))).toBe('1 free bet');
    expect(label(BJ_POT_OF_GOLD, BJ_POT_OF_GOLD.resolve(ctx(7)))).toBe('7 free bets');
  });

  it('counts the free bets a round actually gave', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulateBjRound({ tables, seed: { run: 'bj-bonus', round }, bonuses: { potOfGold: 1 }, recordEvents: true });
      const free = r.events.filter((e) => e.type === 'MoveMade' && e.free).length;
      expect(r.freeBets).toBe(free);
      expect(r.bonuses[0]!.net).toBe(free === 0 ? -1 : BJ_POT_OF_GOLD.rows[7 - free]!.pays);
    }
  });

  it('Push 22 makes the dealer draw out even when every hand busts or has blackjack', () => {
    let drawnOut = 0;
    for (let round = 0; round < 4000; round++) {
      const seed = { run: 'bj-bonus', round };
      const plain = simulateBjRound({ tables, seed });
      const r = simulateBjRound({ tables, seed, bonuses: { push22: 1 } });
      const won = r.dealerTotal.total === 22 && !r.dealerBlackjack;
      expect(r.bonuses).toEqual([{ id: 'push22', row: won ? 0 : -1, net: won ? 11 : -1 }]);
      // The main game is settled exactly as without the bet.
      expect(r.net - r.bonuses[0]!.net).toBe(plain.net);
      if (!r.dealerBlackjack) {
        const total = handTotal(r.dealer);
        expect(total.bust || total.total >= 17).toBe(true);
      }
      if (r.dealer.length > plain.dealer.length) drawnOut++;
    }
    expect(drawnOut).toBeGreaterThan(100);
  });

  it('Push 22 loses to a dealer blackjack', () => {
    const dealer = cards('AS KD');
    expect(BJ_PUSH_22.resolve({ freeBets: 0, dealer, dealerTotal: handTotal(dealer), dealerBlackjack: true })).toBe(-1);
  });
});
