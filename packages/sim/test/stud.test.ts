import { describe, expect, it } from 'vitest';
import { decideStud, evaluatePoker, simulateStudRound, studMultiplier, type Card, type StudDecision, type Suit } from '../src';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const cards = (spec: string): Card[] =>
  spec.split(' ').map((c, i) => ({
    uid: `s${i}${c}`,
    rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
    suit: c.slice(-1) as Suit,
    source: 'player' as const,
  }));

const decide = (hole: string, shown = '', bets: number[] = []) => {
  const decision: StudDecision = {
    street: (3 + (shown ? shown.split(' ').length : 0)) as 3 | 4 | 5,
    hole: cards(hole),
    shown: shown ? cards(shown) : [],
    bets,
    raises: [1, 3],
  };
  const choice = decideStud(decision);
  return choice.move === 'fold' ? 'fold' : `${choice.size}x`;
};

describe('studMultiplier', () => {
  const mult = (spec: string) => studMultiplier(evaluatePoker(cards(spec)));
  it('pays jacks or better, pushes sixes to tens, loses below', () => {
    expect(mult('JC JD 9H 4S 2C')).toBe(1);
    expect(mult('6C 6D 9H 4S 2C')).toBe(0);
    expect(mult('TC TD 9H 4S 2C')).toBe(0);
    expect(mult('5C 5D 9H 4S 2C')).toBe(-1);
    expect(mult('AC KD 9H 4S 2C')).toBe(-1);
  });
  it('pays the rest of the table', () => {
    expect(mult('5C 5D 9H 9S 2C')).toBe(2);
    expect(mult('9C 8D 7H 6S 5C')).toBe(4);
    expect(mult('AS KS QS JS TS')).toBe(500);
  });
});

describe('decideStud follows the published strategy', () => {
  it('two cards: 3x pairs, 1x two points or 6-5 suited, fold the rest', () => {
    expect(decide('4C 4D')).toBe('3x');
    expect(decide('JC 3D')).toBe('1x');
    expect(decide('8C 7D')).toBe('1x');
    expect(decide('6H 5H')).toBe('1x');
    expect(decide('6H 5C')).toBe('fold');
    expect(decide('7C 2D')).toBe('fold');
  });
  it('three cards: 3x made hands and strong suited draws', () => {
    expect(decide('8C 8D', '2S')).toBe('3x');
    expect(decide('JH QH', 'KH')).toBe('3x'); // royal flush draw
    expect(decide('5S 6S', '7S')).toBe('3x'); // no gaps, 567
    expect(decide('2S 9S', '4S')).toBe('1x'); // just three suited
    expect(decide('3C 3D', '9S')).toBe('1x'); // low pair
    expect(decide('2C 7D', '9S')).toBe('fold');
  });
  it('four cards: 3x four to a flush or an open straight, 8-high or better', () => {
    expect(decide('2H 9H', '5H KH')).toBe('3x');
    expect(decide('5C 6D', '7H 8S')).toBe('3x');
    expect(decide('2C 3D', '4H 5S')).toBe('1x'); // straight draw below 8-high
    expect(decide('7C 8D', '9H TS', [3])).toBe('3x');
    expect(decide('2C 7D', '9S 4H', [1, 1])).toBe('fold');
  });
});

describe('simulateStudRound', () => {
  it('replays identically from the same seed', () => {
    const run = () => simulateStudRound({ seed: { run: 'stud', round: 5 }, decide: decideStud, recordEvents: true });
    expect(run()).toEqual(run());
  });

  it('a fold forfeits the ante and every bet made so far', () => {
    let folds = 0;
    for (let round = 0; round < 3000; round++) {
      const r = simulateStudRound({ seed: { run: 'stud', round }, decide: decideStud });
      if (!r.folded) continue;
      folds++;
      expect(r.net).toBe(-(1 + r.bets.reduce((a, b) => a + b, 0)));
    }
    expect(folds).toBeGreaterThan(1000);
  });

  it('pays every bet at the same multiplier', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulateStudRound({ seed: { run: 'stud', round }, decide: decideStud });
      if (r.folded) continue;
      expect(r.bets).toHaveLength(3);
      expect(r.net).toBe(r.multiplier! * r.wagered);
    }
  });
});
