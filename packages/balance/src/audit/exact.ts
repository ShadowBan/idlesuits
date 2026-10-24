import {
  categoryOfScore,
  decideStud,
  evaluateHand,
  pokerScore,
  standardDeck,
  STUD_RULES,
  decideLir,
  LIR_RULES,
  paiGowDeck,
  PG_BONUSES,
  PG_CATEGORY_NAMES,
  sevenCardCategory,
  sevenCardFeatures,
  STUD_THREE_CARD,
  studMultiplier,
  TCP_PAIR_PLUS,
  TCP_PLAY_FROM,
  TCP_RULES,
  threeCardHand,
  threeCardScore,
  UTH_HOLE_CARD,
  UTH_SIX_CARD,
  UTH_TRIPS,
  type BonusBet,
  type Card,
  type Category,
  type PokerHand,
  type Suit,
  type UthBonusContext,
} from '@idlesuits/sim';

/**
 * Exact odds, by dealing every possible hand through the simulator's own
 * evaluators and side-bet rules. Each task counts outcomes; the big ones take
 * a part (w of W) so they can be split across processes and the counts added.
 */

export type Counts = Record<string, number>;

const DECK = standardDeck('player');

function add(counts: Counts, key: string, n = 1) {
  counts[key] = (counts[key] ?? 0) + n;
}

const rowKey = (bet: BonusBet<never>, row: number) => (row < 0 ? 'loses' : bet.rows[row]!.label);

/** Trips: the player's best five of all 133,784,560 seven-card hands. Split on the first card. */
export function tripsCounts(part: number, parts: number): Counts {
  const counts: Counts = {};
  const byRow = new Float64Array(UTH_TRIPS.rows.length + 1);
  const hand = new Array<Card>(7);
  const playerHand = { category: 0 as Category } as PokerHand;
  const ctx = { playerHand } as UthBonusContext;
  for (let a = part; a < 46; a += parts) {
    hand[0] = DECK[a]!;
    for (let b = a + 1; b < 47; b++) {
      hand[1] = DECK[b]!;
      for (let c = b + 1; c < 48; c++) {
        hand[2] = DECK[c]!;
        for (let d = c + 1; d < 49; d++) {
          hand[3] = DECK[d]!;
          for (let e = d + 1; e < 50; e++) {
            hand[4] = DECK[e]!;
            for (let f = e + 1; f < 51; f++) {
              hand[5] = DECK[f]!;
              for (let g = f + 1; g < 52; g++) {
                hand[6] = DECK[g]!;
                playerHand.category = categoryOfScore(pokerScore(hand));
                byRow[UTH_TRIPS.resolve(ctx) + 1]!++;
              }
            }
          }
        }
      }
    }
  }
  byRow.forEach((n, i) => n && add(counts, rowKey(UTH_TRIPS, i - 1), n));
  return counts;
}

/** 6-Card Bonus: every six-card hand. Which two are "hole" cards does not matter to a best-five. */
export function sixCardCounts(part: number, parts: number): Counts {
  const counts: Counts = {};
  const byRow = new Float64Array(UTH_SIX_CARD.rows.length + 1);
  const hole = new Array<Card>(2);
  const bonusCards = new Array<Card>(4);
  const ctx = { hole, bonusCards } as unknown as UthBonusContext;
  for (let a = part; a < 47; a += parts) {
    hole[0] = DECK[a]!;
    for (let b = a + 1; b < 48; b++) {
      hole[1] = DECK[b]!;
      for (let c = b + 1; c < 49; c++) {
        bonusCards[0] = DECK[c]!;
        for (let d = c + 1; d < 50; d++) {
          bonusCards[1] = DECK[d]!;
          for (let e = d + 1; e < 51; e++) {
            bonusCards[2] = DECK[e]!;
            for (let f = e + 1; f < 52; f++) {
              bonusCards[3] = DECK[f]!;
              byRow[UTH_SIX_CARD.resolve(ctx) + 1]!++;
            }
          }
        }
      }
    }
  }
  byRow.forEach((n, i) => n && add(counts, rowKey(UTH_SIX_CARD, i - 1), n));
  return counts;
}

/** Hole Card Bonus: every pair of player cards against every pair of dealer cards. */
export function holeCardCounts(): Counts {
  const counts: Counts = {};
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = 0; c < 52; c++) {
        if (c === a || c === b) continue;
        for (let d = c + 1; d < 52; d++) {
          if (d === a || d === b) continue;
          const ctx = { hole: [DECK[a]!, DECK[b]!], dealer: [DECK[c]!, DECK[d]!] } as unknown as UthBonusContext;
          add(counts, rowKey(UTH_HOLE_CARD, UTH_HOLE_CARD.resolve(ctx)));
        }
      }
  return counts;
}

/** A three-card side bet (Mississippi Stud's by default): every set of three cards, by the line it pays. */
export function threeCardCounts(bet: BonusBet<never> = STUD_THREE_CARD as BonusBet<never>): Counts {
  const counts: Counts = {};
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        // The same three cards, whichever field the bet reads them from.
        const cards = [DECK[a]!, DECK[b]!, DECK[c]!];
        const row = bet.resolve({ hole: cards, community: cards } as never);
        add(counts, rowKey(bet, row));
      }
  return counts;
}

/**
 * Flush size and longest straight flush over all seven-card hands. Suits are
 * independent, so every subset of one suit is evaluated once and the four
 * suits combined by counting, which covers all 133,784,560 hands exactly.
 */
export function suitsCounts(): { flushSize: Counts; straightFlush: Counts } {
  // perSuit[size][run] = subsets of one suit with that many cards and that longest run.
  const perSuit: number[][] = Array.from({ length: 8 }, () => new Array(14).fill(0));
  const spades = DECK.filter((c) => c.suit === ('S' as Suit));
  for (let mask = 0; mask < 1 << 13; mask++) {
    const cards = spades.filter((_, i) => mask & (1 << i));
    if (cards.length > 7) continue;
    const hand = evaluateHand(cards);
    perSuit[cards.length]![cards.length === 0 ? 0 : hand.straightFlush]!++;
  }
  // states: key "cards,maxSize,maxRun" -> count, built suit by suit.
  let states = new Map<string, number>([['0,0,0', 1]]);
  for (let suit = 0; suit < 4; suit++) {
    const next = new Map<string, number>();
    for (const [key, n] of states) {
      const [used, size, run] = key.split(',').map(Number) as [number, number, number];
      for (let k = 0; k + used <= 7; k++) {
        perSuit[k]!.forEach((m, r) => {
          if (!m) return;
          const to = `${used + k},${Math.max(size, k)},${Math.max(run, r)}`;
          next.set(to, (next.get(to) ?? 0) + n * m);
        });
      }
    }
    states = next;
  }
  const flushSize: Counts = {};
  const straightFlush: Counts = {};
  for (const [key, n] of states) {
    const [used, size, run] = key.split(',').map(Number) as [number, number, number];
    if (used !== 7) continue;
    add(flushSize, String(size), n);
    add(straightFlush, String(run), n);
  }
  return { flushSize, straightFlush };
}

/**
 * Mississippi Stud's main game, exactly: every hole pair, every order the
 * three community cards can come in, played by the same strategy the table
 * suggests. Returns totals in antes over all 155,937,600 deals.
 */
export function studMainTotals(part: number, parts: number): Counts {
  let net = 0;
  let wagered = 0;
  let deals = 0;
  const mult = new Float64Array(52 * 52 * 52);
  const five = new Array<Card>(5);
  const raises = STUD_RULES.raises;
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) {
      if ((a * 52 + b) % parts !== part) continue;
      const hole = [DECK[a]!, DECK[b]!];
      const rest = DECK.filter((_, i) => i !== a && i !== b);
      // The multiplier for each unordered set of community cards, filed under every order.
      five[0] = hole[0]!;
      five[1] = hole[1]!;
      for (let x = 0; x < 50; x++)
        for (let y = x + 1; y < 50; y++)
          for (let z = y + 1; z < 50; z++) {
            five[2] = rest[x]!;
            five[3] = rest[y]!;
            five[4] = rest[z]!;
            const score = pokerScore(five);
            const category = categoryOfScore(score);
            const madeRank = Math.floor(score / 15 ** 4) % 15;
            const m = studMultiplier({ category, madeRank, ranks: [], score });
            for (const [i, j, k] of [[x, y, z], [x, z, y], [y, x, z], [y, z, x], [z, x, y], [z, y, x]] as const) {
              mult[(i * 52 + j) * 52 + k] = m;
            }
          }

      const choice3 = decideStud({ street: 3, hole, shown: [], bets: [], raises });
      if (choice3.move === 'fold') {
        net -= 117600;
        wagered += 117600;
        deals += 117600;
        continue;
      }
      for (let i = 0; i < 50; i++) {
        const choice4 = decideStud({ street: 4, hole, shown: [rest[i]!], bets: [choice3.size], raises });
        if (choice4.move === 'fold') {
          const lost = 1 + choice3.size;
          net -= lost * 2352;
          wagered += lost * 2352;
          deals += 2352;
          continue;
        }
        for (let j = 0; j < 50; j++) {
          if (j === i) continue;
          const choice5 = decideStud({
            street: 5,
            hole,
            shown: [rest[i]!, rest[j]!],
            bets: [choice3.size, choice4.size],
            raises,
          });
          if (choice5.move === 'fold') {
            const lost = 1 + choice3.size + choice4.size;
            net -= lost * 48;
            wagered += lost * 48;
            deals += 48;
            continue;
          }
          const stake = 1 + choice3.size + choice4.size + choice5.size;
          for (let k = 0; k < 50; k++) {
            if (k === i || k === j) continue;
            net += mult[(i * 52 + j) * 52 + k]! * stake;
            wagered += stake;
            deals++;
          }
        }
      }
    }
  return { net, wagered, deals };
}

/**
 * Three Card Poker's Ante and Play, exactly: every player hand against every
 * dealer hand from the other 49 cards, 407,170,400 deals, played Q-6-4 or
 * better. Counted by net result in antes, as Wizard of Odds tabulates them.
 */
export function tcpMainCounts(part: number, parts: number): Counts {
  const combos: { score: number; hand: string; lo: number; hi: number }[] = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const cards = [DECK[a]!, DECK[b]!, DECK[c]!];
        const bit = (i: number, lo: boolean) => (lo ? (i < 26 ? 1 << i : 0) : i >= 26 ? 1 << (i - 26) : 0);
        combos.push({
          score: threeCardScore(cards),
          hand: threeCardHand(cards),
          lo: bit(a, true) | bit(b, true) | bit(c, true),
          hi: bit(a, false) | bit(b, false) | bit(c, false),
        });
      }
  const qualifyFrom = TCP_RULES.qualifyHigh * 15 * 15;
  const byNet = new Map<number, number>();
  for (let i = part; i < combos.length; i += parts) {
    const p = combos[i]!;
    if (p.score < TCP_PLAY_FROM) {
      byNet.set(-1, (byNet.get(-1) ?? 0) + 18424);
      continue;
    }
    const bonus = TCP_RULES.anteBonus[p.hand as keyof typeof TCP_RULES.anteBonus] ?? 0;
    for (const d of combos) {
      if (d.lo & p.lo || d.hi & p.hi) continue;
      const net = d.score < qualifyFrom ? 1 : p.score > d.score ? 2 : p.score < d.score ? -2 : 0;
      byNet.set(net + bonus, (byNet.get(net + bonus) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...byNet].map(([net, n]) => [String(net), n]));
}

/**
 * Every seven-card Pai Gow hand from the 53-card deck, 154,143,080 of them:
 * the best poker hand each makes, and the line each side bet pays. Keys are
 * "hand:<name>" and "<bet id>:<line>".
 */
export function paiGowSevenCounts(part: number, parts: number): Counts {
  const deck = paiGowDeck();
  const counts: Counts = {};
  const hand = new Array<Card>(7);
  const features = sevenCardFeatures(deck.slice(0, 7));
  const ctx = { cards: hand, features };
  const byCategory = new Float64Array(11);
  const byRow = PG_BONUSES.map((b) => new Float64Array(b.rows.length + 1));
  for (let a = part; a < 47; a += parts) {
    hand[0] = deck[a]!;
    for (let b = a + 1; b < 48; b++) {
      hand[1] = deck[b]!;
      for (let c = b + 1; c < 49; c++) {
        hand[2] = deck[c]!;
        for (let d = c + 1; d < 50; d++) {
          hand[3] = deck[d]!;
          for (let e = d + 1; e < 51; e++) {
            hand[4] = deck[e]!;
            for (let f = e + 1; f < 52; f++) {
              hand[5] = deck[f]!;
              for (let g = f + 1; g < 53; g++) {
                hand[6] = deck[g]!;
                sevenCardFeatures(hand, features);
                byCategory[sevenCardCategory(features)]!++;
                for (let i = 0; i < PG_BONUSES.length; i++) byRow[i]![PG_BONUSES[i]!.resolve(ctx) + 1]!++;
              }
            }
          }
        }
      }
    }
  }
  byCategory.forEach((n, c) => n && add(counts, `hand:${PG_CATEGORY_NAMES[c as keyof typeof PG_CATEGORY_NAMES]}`, n));
  PG_BONUSES.forEach((bet, i) =>
    byRow[i]!.forEach((n, row) => n && add(counts, `${bet.id}:${rowKey(bet as BonusBet<never>, row - 1)}`, n)),
  );
  return counts;
}

/** Pairplus: every three-card hand, by the line it pays. */
export function pairPlusCounts(): Counts {
  const counts: Counts = {};
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const row = TCP_PAIR_PLUS.resolve({ player: [DECK[a]!, DECK[b]!, DECK[c]!], dealer: [] });
        add(counts, rowKey(TCP_PAIR_PLUS as BonusBet<never>, row));
      }
  return counts;
}

/**
 * Prime: every player hand against every dealer hand, by color alone. Counted
 * by color class rather than through the bet itself, which the tests cover.
 */
export function primeCounts(part: number, parts: number): Counts {
  const red = (i: number) => DECK[i]!.suit === 'H' || DECK[i]!.suit === 'D';
  const combos: { color: number; lo: number; hi: number }[] = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const reds = Number(red(a)) + Number(red(b)) + Number(red(c));
        const bit = (i: number) => [i < 26 ? 1 << i : 0, i >= 26 ? 1 << (i - 26) : 0] as const;
        combos.push({
          color: reds === 3 ? 1 : reds === 0 ? 2 : 0,
          lo: bit(a)[0] | bit(b)[0] | bit(c)[0],
          hi: bit(a)[1] | bit(b)[1] | bit(c)[1],
        });
      }
  const counts: Counts = {};
  for (let i = part; i < combos.length; i += parts) {
    const p = combos[i]!;
    for (const d of combos) {
      if (p.lo & d.lo || p.hi & d.hi) continue;
      const line = !p.color ? 'loses' : d.color === p.color ? 'All six cards one color' : 'Your three cards one color';
      add(counts, line);
    }
  }
  return counts;
}

const LIR_LINES = [
  'Royal flush',
  'Straight flush',
  'Four of a kind',
  'Full house',
  'Flush',
  'Straight',
  'Three of a kind',
  'Two pair',
  'Tens or better',
];

/**
 * Let It Ride, exactly: every three-card hand and every order of the two
 * community cards, 51,979,200 deals, played by the table's strategy. Keys are
 * "<line>:<bets riding>" as Wizard of Odds tabulates them, plus "net".
 */
export function lirCounts(part: number, parts: number): Counts {
  const counts: Counts = {};
  const five = new Array<Card>(5);
  const line = new Int8Array(49 * 49);
  const pays = [1000, 200, 50, 11, 8, 5, 3, 2, 1];
  let net = 0;
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        if ((a * 2704 + b * 52 + c) % parts !== part) continue;
        const hole = [DECK[a]!, DECK[b]!, DECK[c]!];
        const rest = DECK.filter((_, i) => i !== a && i !== b && i !== c);
        five[0] = hole[0]!;
        five[1] = hole[1]!;
        five[2] = hole[2]!;
        // The pay line for each pair of community cards, filed both ways round.
        for (let x = 0; x < 49; x++)
          for (let y = x + 1; y < 49; y++) {
            five[3] = rest[x]!;
            five[4] = rest[y]!;
            const score = pokerScore(five);
            const category = categoryOfScore(score);
            const pair = Math.floor(score / 15 ** 4) % 15;
            let l = -1;
            if (category >= 2) l = 9 - category;
            else if (category === 1 && pair >= LIR_RULES.payPairFrom) l = 8;
            line[x * 49 + y] = l;
            line[y * 49 + x] = l;
          }
        const first = decideLir(hole) === 'ride' ? 1 : 0;
        for (let x = 0; x < 49; x++) {
          const second = decideLir([...hole, rest[x]!]) === 'ride' ? 1 : 0;
          const bets = 1 + first + second;
          for (let y = 0; y < 49; y++) {
            if (y === x) continue;
            const l = line[x * 49 + y]!;
            add(counts, `${l < 0 ? 'Loser' : LIR_LINES[l]}:${bets}`);
            net += (l < 0 ? -1 : pays[l]!) * bets;
          }
        }
      }
  counts.net = net;
  return counts;
}

/** A side bet on five cards: every five-card hand, by the line it pays. */
export function fiveCardCounts(bet: BonusBet<never>, ctx: (cards: Card[]) => unknown): Counts {
  const counts: Counts = {};
  const hand = new Array<Card>(5);
  const byRow = new Float64Array(bet.rows.length + 1);
  for (let a = 0; a < 48; a++) {
    hand[0] = DECK[a]!;
    for (let b = a + 1; b < 49; b++) {
      hand[1] = DECK[b]!;
      for (let c = b + 1; c < 50; c++) {
        hand[2] = DECK[c]!;
        for (let d = c + 1; d < 51; d++) {
          hand[3] = DECK[d]!;
          for (let e = d + 1; e < 52; e++) {
            hand[4] = DECK[e]!;
            byRow[bet.resolve(ctx(hand) as never) + 1]!++;
          }
        }
      }
    }
  }
  byRow.forEach((n, i) => n && add(counts, rowKey(bet, i - 1), n));
  return counts;
}

/** Adds counts from several parts together. */
export function mergeCounts(parts: Counts[]): Counts {
  const total: Counts = {};
  for (const counts of parts) for (const [k, v] of Object.entries(counts)) add(total, k, v);
  return total;
}
