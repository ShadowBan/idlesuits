import { describe, expect, it } from 'vitest';
import {
  allSets,
  applySet,
  decideTcp,
  houseWay,
  isLegalSet,
  PG_FORTUNE,
  PgCategory,
  pgCategoryOf,
  pgScore2,
  pgScore5,
  simulatePaiGowRound,
  simulateTcpRound,
  TCP_PAIR_PLUS,
  TCP_PRIME,
  threeCardScore,
  type Card,
  type Suit,
} from '../src';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const cards = (spec: string): Card[] =>
  spec.split(' ').map((c, i) =>
    c === 'W'
      ? { uid: `t${i}W`, rank: 14, suit: 'S' as Suit, source: 'player' as const, joker: true }
      : { uid: `t${i}${c}`, rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)), suit: c.slice(-1) as Suit, source: 'player' as const },
  );

describe('Three Card Poker', () => {
  it('ranks a straight over a flush, and A-2-3 as the lowest straight', () => {
    expect(threeCardScore(cards('4D 5C 6H'))).toBeGreaterThan(threeCardScore(cards('2S 7S KS')));
    expect(threeCardScore(cards('AD 2C 3H'))).toBeLessThan(threeCardScore(cards('2D 3C 4H')));
    expect(threeCardScore(cards('AD KC QH'))).toBeGreaterThan(threeCardScore(cards('2D 3C 4H')));
  });

  it('plays queen-6-4 and better', () => {
    expect(decideTcp(cards('QD 6C 4H'))).toBe('play');
    expect(decideTcp(cards('QD 6C 3H'))).toBe('fold');
    expect(decideTcp(cards('QD 7C 2H'))).toBe('play');
    expect(decideTcp(cards('2D 2C 3H'))).toBe('play');
  });

  it('pays the ante bonus whenever the player plays, and settles side bets even after a fold', () => {
    let folds = 0;
    for (let round = 0; round < 3000; round++) {
      const seed = { run: 'tcp-test', round };
      const plain = simulateTcpRound({ seed, decide: (d) => decideTcp(d.cards) });
      const r = simulateTcpRound({ seed, decide: (d) => decideTcp(d.cards), bonuses: { pairPlus: 1, sixCard: 1, prime: 1 } });
      expect(r.net).toBeCloseTo(plain.net + r.parts.bonus, 9);
      expect(r.bonuses).toHaveLength(3);
      if (r.folded) {
        folds++;
        expect(r.parts).toMatchObject({ ante: -1, play: 0, anteBonus: 0 });
      } else if (!r.qualified) {
        expect([r.parts.ante, r.parts.play]).toEqual([1, 0]);
      }
    }
    expect(folds).toBeGreaterThan(800);
  });

  it('Pairplus and Prime read the right cards', () => {
    expect(TCP_PAIR_PLUS.resolve({ player: cards('AS KS QS'), dealer: cards('2D 3D 4D') })).toBe(0);
    expect(TCP_PAIR_PLUS.resolve({ player: cards('9S 9H 2D'), dealer: cards('2D 3D 4D') })).toBe(4);
    expect(TCP_PRIME.resolve({ player: cards('AS KC 2S'), dealer: cards('3C 4S 5C') })).toBe(0);
    expect(TCP_PRIME.resolve({ player: cards('AS KC 2S'), dealer: cards('3H 4S 5C') })).toBe(1);
    expect(TCP_PRIME.resolve({ player: cards('AS KH 2S'), dealer: cards('3C 4S 5C') })).toBe(-1);
  });
});

describe('Pai Gow Poker hands', () => {
  const score = (spec: string) => pgScore5(cards(spec));
  const category = (spec: string) => pgCategoryOf(score(spec));

  it('uses the joker as an ace, or to finish a straight or flush, and nothing else', () => {
    expect(category('AS AD AH AC W')).toBe(PgCategory.FiveAces);
    expect(category('KS KD W 7C 2H')).toBe(PgCategory.Pair); // joker plays as an ace kicker, not a king
    expect(category('9S TD JH QC W')).toBe(PgCategory.Straight);
    expect(category('2S 7S 9S JS W')).toBe(PgCategory.Flush);
    expect(category('TS JS QS KS W')).toBe(PgCategory.RoyalFlush);
    expect(category('AS AD W 7C 2H')).toBe(PgCategory.Trips);
  });

  it('a joker flush takes the highest card the suit is missing', () => {
    expect(score('AS KS 7S 5S W')).toBe(score('AS KS QS 7S 5S'));
  });

  it('ranks the wheel as the second-best straight', () => {
    expect(score('AS 2D 3H 4C 5S')).toBeGreaterThan(score('9S TD JH QC KS'));
    expect(score('AS 2D 3H 4C 5S')).toBeLessThan(score('TS JD QH KC AS'));
  });

  it('two-card hands: a pair, or the two cards high to low; the joker is an ace', () => {
    expect(pgScore2(cards('W KD'))).toBe(pgScore2(cards('AS KD')));
    expect(pgScore2(cards('2S 2D'))).toBeGreaterThan(pgScore2(cards('AS KD')));
  });
});

describe('Foxwoods house way', () => {
  const low = (spec: string) => {
    const hand = cards(spec);
    const { low } = applySet(hand, houseWay(hand));
    return low.map((c) => (c.joker ? 'W' : `${c.rank}${c.suit}`)).sort().join(' ');
  };

  it('no pair: second and third highest in front', () => {
    expect(low('AS KD 9H 7C 5S 3D 2H')).toBe(['13D', '9H'].sort().join(' '));
  });
  it('one pair: pair in back, two highest others in front', () => {
    expect(low('8S 8D AH KC 5S 3D 2H')).toBe(['13C', '14H'].sort().join(' '));
  });
  it('two pair, jacks or better: split, small pair in front', () => {
    expect(low('JS JD 4H 4C AS 9D 2H')).toBe(['4C', '4H'].sort().join(' '));
  });
  it('two pair, sevens to tens: keep both behind only with an ace to play in front', () => {
    expect(low('9S 9D 4H 4C AS QD 2H')).toBe(['12D', '14S'].sort().join(' '));
    expect(low('9S 9D 4H 4C KS QD 2H')).toBe(['4C', '4H'].sort().join(' '));
  });
  it('three of a kind aces: break one off with the best other card', () => {
    expect(low('AS AD AH KC 9S 5D 2H')).toContain('13C');
  });
  it('full house: the pair goes in front', () => {
    expect(low('8S 8D 8H 3C 3S QD 2H')).toBe(['3C', '3S'].sort().join(' '));
  });
  it('a straight stays in back, with the best two cards it can spare in front', () => {
    expect(low('9S TD JH QC KS 2D 3H')).toBe(['2D', '3H'].sort().join(' '));
    expect(low('9S TD JH QC KS AD 2H')).toBe(['14D', '2H'].sort().join(' ')); // 9-K in back leaves A-2, the best front
  });

  it('never fouls, on thousands of real deals', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulatePaiGowRound({ seed: { run: 'pg-test', round }, decide: (d) => d.suggestion });
      expect(r.playerSet.highScore).toBeGreaterThan(r.playerSet.lowScore);
      expect(r.dealerSet.highScore).toBeGreaterThan(r.dealerSet.lowScore);
    }
  });
});

describe('Pai Gow Poker rounds', () => {
  it('pays 0.95 for both hands, pushes a split, and gives copies to the dealer', () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < 2000; round++) {
      const r = simulatePaiGowRound({ seed: { run: 'pg-round', round }, decide: (d) => d.suggestion });
      outcomes.add(r.outcome);
      const won = Number(r.high === 'player') + Number(r.low === 'player');
      expect(r.main).toBe(won === 2 ? 0.95 : won === 1 ? 0 : -1);
    }
    expect(outcomes).toEqual(new Set(['win', 'push', 'lose']));
  });

  it('an illegal set is set by the house way instead', () => {
    const r = simulatePaiGowRound({
      seed: { run: 'pg-foul', round: 1 },
      decide: (d) => {
        const fouls = allSets().find((s) => !isLegalSet(d.cards, s));
        return fouls ?? d.suggestion;
      },
    });
    expect(r.playerSet.highScore).toBeGreaterThan(r.playerSet.lowScore);
  });

  it('Fortune pays on the seven cards however they are set', () => {
    expect(PG_FORTUNE.resolve({ cards: cards('AS AD AH AC W 2D 3H') })).toBe(3);
    expect(PG_FORTUNE.resolve({ cards: cards('AS KD 9H 7C 5S 3D 2H') })).toBe(-1);
  });
});
