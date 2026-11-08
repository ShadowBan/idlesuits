import { describe, expect, it } from 'vitest';
import {
  crashAt,
  crashChance,
  crashPoint,
  crashTimeTo,
  CRASH_CAP,
  dropBall,
  minesBoard,
  minesCashout,
  minesState,
  minesSurvival,
  minesAverage,
  cartsFor,
  cartMultiplier,
  cartRide,
  CART_BOOSTS,
  CART_MEAN,
  CART_TRACKS,
  VAULT_FULL,
  VAULT_PICKS,
  VAULT_SQUARES,
  vaultBoard,
  crashLineRtp,
  isGoldenLine,
  GOLD_CHANCE,
  GOLD_X,
  isGolden,
  FEVER_CHANCE,
  FEVER_LADDER,
  FEVER_LIFT,
  plinkoPayback,
  MINES_TILES,
  PLINKO_RISKS,
  PLINKO_ROWS,
  plinkoOdds,
  plinkoPays,
  plinkoRTP,
  plinkoSlots,
  Rng,
  starsFor,
  type MinesFind,
  GOLD_BALL_X,
  KENO_DRAWN,
  KENO_MAX_SPOTS,
  KENO_NUMBERS,
  kenoDraw,
  kenoOdds,
  kenoPayback,
  kenoPays,
  kenoQuickPick,
  kenoSettle,
  kenoStamp,
  kenoTicketRtp,
  kenoRow,
  KENO_CARD_SHARE,
  KENO_ROW_SHARE,
  KENO_BUFFS,
  KENO_BUFF_START,
  KENO_PATTERN_ODDS,
  KENO_GOLD_RUSH_X,
  kenoAfterDraw,
  kenoBuffOnDraw,
  kenoBuffRate,
  kenoBuffShare,
  kenoBuffValue,
  kenoPatterns,
  type KenoBuffState,
} from '../src';

/** Mean and standard error of a sample. */
function stats(xs: number[]): { mean: number; se: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sq = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, se: Math.sqrt(sq / xs.length) };
}

describe('mines', () => {
  const finds = (n: number, tile: MinesFind['tile'] = 'gem'): MinesFind[] => Array.from({ length: n }, () => ({ tile }));

  it('lays out the bombs chosen, a few stars, a cart where the board can afford one, and gems', () => {
    for (let bombs = 1; bombs <= 24; bombs++) {
      const board = minesBoard(bombs, { run: 'm', round: bombs });
      expect(board).toHaveLength(MINES_TILES);
      expect(board.filter((t) => t === 'bomb')).toHaveLength(bombs);
      expect(board.filter((t) => t === 'star')).toHaveLength(starsFor(bombs));
      expect(board.filter((t) => t === 'cart')).toHaveLength(cartsFor(bombs));
      expect(board.filter((t) => t === 'gem').length).toBeGreaterThanOrEqual(1);
      expect(minesBoard(bombs, { run: 'm', round: bombs })).toEqual(board);
    }
    expect([1, 2, 3, 6, 23, 24].map(starsFor)).toEqual([0, 0, 1, 2, 1, 0]);
    expect([1, 2, 10, 22].map(cartsFor)).toEqual([0, 1, 1, 0]);
  });

  it('prices every pick fairly, cash-out and vault together, and never lowers the cash-out on a find', () => {
    for (const rtp of [0.97, 0.6]) {
      for (let bombs = 1; bombs <= 24; bombs++) {
        const found: MinesFind[] = [];
        for (;;) {
          const st = minesState(bombs, found, rtp);
          const safe = st.gemsLeft + st.starsLeft + st.cartsLeft;
          if (!safe) break;
          const value = found.length ? st.value : rtp;
          expect(st.gem, `${bombs} bombs, ${found.length} found`).toBeGreaterThanOrEqual(1 - 1e-12);
          // Fair from here: the cash-out after the next pick, plus what it drops in the vault, is worth now on average.
          const left = MINES_TILES - found.length;
          const next = (st.gemsLeft * st.gem + st.starsLeft * st.star + st.cartsLeft * st.cart * CART_MEAN) * value + safe * st.vault;
          expect(next / left / value).toBeCloseTo(1, 12);
          found.push(st.cartsLeft ? { tile: 'cart', cart: 2 } : st.starsLeft ? { tile: 'star' } : { tile: 'gem' });
        }
      }
    }
    // A cart multiplies by its ride on top of a gem's rise.
    expect(minesCashout(10, [{ tile: 'cart', cart: 3.5 }], 0.97)).toBeCloseTo(0.97 * minesState(10, [], 0.97).cart * 3.5, 12);
  });

  it('rides a cart to the first cave-in, adding each boost, CART_MEAN on average', () => {
    expect(cartMultiplier([0, 1, 2, 0], [1, 2, 0, 1])).toBe(1 + 0.25 + 0.5 + 1 + 2);
    expect(cartMultiplier([0, 1, 2, 0], [1, 1, 0, 1])).toBe(1.25);
    expect(cartMultiplier([0, 1, 2, 0], [0, 0, 0, 0])).toBe(1);
    const n = 100_000;
    let sum = 0;
    for (let round = 0; round < n; round++) {
      const pick = new Rng('ride', round);
      sum += cartMultiplier(cartRide({ run: 'r', round }), CART_BOOSTS.map(() => pick.int(CART_TRACKS)));
    }
    expect(Math.abs(sum / n - CART_MEAN)).toBeLessThan(0.03);
  });

  it('pays back exactly the rtp, cash-out and vault together, however many squares the player digs', () => {
    for (const bombs of [1, 3, 8, 20]) {
      for (const stop of [1, 3, 6]) {
        if (stop > MINES_TILES - bombs) continue;
        const pays: number[] = [];
        const survived: number[] = [];
        for (let round = 0; round < 30_000; round++) {
          const board = minesBoard(bombs, { run: 'ev', round });
          const order = new Rng('order', round);
          const open = Array.from({ length: MINES_TILES }, (_, i) => i);
          const found: MinesFind[] = [];
          let lost = false;
          while (found.length < stop) {
            const tile = board[open.splice(order.int(open.length), 1)[0]!]!;
            if (tile === 'bomb') {
              lost = true;
              break;
            }
            const caves = cartRide({ run: 'ev', round });
            found.push(tile === 'cart' ? { tile, cart: cartMultiplier(caves, CART_BOOSTS.map(() => order.int(CART_TRACKS))) } : { tile });
          }
          const vault = found.length * minesState(bombs, [], 0.97).vault;
          pays.push((lost ? 0 : minesCashout(bombs, found, 0.97)) + vault);
          if (!lost) survived.push(minesCashout(bombs, found, 0.97));
        }
        const { mean, se } = stats(pays);
        expect(Math.abs(mean - 0.97), `${bombs} bombs, ${stop} picks`).toBeLessThan(4.5 * se);
        const avg = stats(survived);
        expect(Math.abs(avg.mean - minesAverage(bombs, stop, 0.97)), `${bombs} bombs, average after ${stop}`).toBeLessThan(4.5 * avg.se + 1e-9);
      }
    }
  }, 30_000);

  it('pays the vault back, on average, from its bonus board', () => {
    expect(VAULT_SQUARES).toHaveLength(MINES_TILES);
    expect(VAULT_SQUARES.reduce((a, b) => a + b, 0) / MINES_TILES).toBeCloseTo(1 / VAULT_PICKS, 12);
    const board = vaultBoard({ run: 'v', round: 1 });
    expect([...board].sort()).toEqual([...VAULT_SQUARES].sort());
    expect(VAULT_FULL).toBeGreaterThan(10);
  });
});

describe('crash', () => {
  it('lasts to any target as often as rtp ÷ target, and snaps at once (before 1.01×) the rest of the time', () => {
    const n = 200_000;
    const points = Array.from({ length: n }, (_, round) => crashPoint(0.97, { run: 'c', round }));
    for (const target of [1.01, 1.5, 2, 5, 10, 50]) {
      const p = crashChance(0.97, target);
      const hit = points.filter((x) => x >= target).length / n;
      expect(Math.abs(hit - p), `${target}×`).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n));
    }
    const instant = points.filter((x) => x === 1).length / n;
    const p = 1 - 0.97 / 1.01;
    expect(Math.abs(instant - p)).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n));
    expect(points.reduce((a, b) => Math.max(a, b), 0)).toBeLessThanOrEqual(CRASH_CAP);
    for (const x of points.slice(0, 1000)) expect(Math.round(x * 100)).toBeCloseTo(x * 100, 6);
  });

  it('drops a golden line now and then, and lines and golden lines together pay the floor’s payback', () => {
    const n = 200_000;
    let gold = 0;
    for (let round = 0; round < n; round++) if (isGoldenLine({ run: 'g', round })) gold++;
    expect(Math.abs(gold / n - GOLD_CHANCE)).toBeLessThan(4.5 * Math.sqrt((GOLD_CHANCE * (1 - GOLD_CHANCE)) / n));
    // A line aimed at x pays x with chance lineRtp ÷ x, twice over when golden.
    const line = crashLineRtp(0.97);
    expect(line * (1 - GOLD_CHANCE) + line * GOLD_X * GOLD_CHANCE).toBeCloseTo(0.97, 12);
  });

  it('climbs smoothly, doubling at a steady pace', () => {
    expect(crashAt(0)).toBe(1);
    expect(crashAt(crashTimeTo(2))).toBe(2);
    expect(crashAt(crashTimeTo(10) + 1)).toBe(10);
    for (let ms = 0; ms < 60_000; ms += 777) expect(crashAt(ms + 777)).toBeGreaterThanOrEqual(crashAt(ms));
  });
});

describe('plinko', () => {
  it('lands each slot as often as the binomial says', () => {
    for (const rows of PLINKO_ROWS) {
      const odds = plinkoOdds(rows);
      expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      const n = 100_000;
      const counts = Array<number>(rows + 1).fill(0);
      for (let round = 0; round < n; round++) counts[dropBall(rows, { run: 'p', round }).slot]!++;
      odds.forEach((p, k) => expect(Math.abs(counts[k]! / n - p), `${rows} rows, slot ${k}`).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n) + 1e-9));
    }
  });

  it('is designed near 99%, mirrored, worst in the middle, and scales to any payback exactly', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const slots = plinkoSlots(rows, risk);
        expect(slots).toEqual([...slots].reverse());
        expect(Math.min(...slots)).toBe(slots[rows / 2]);
        expect(slots[rows / 2]).toBeLessThan(1);
        // Fever included, every board is drawn within a sixth of a percent of 97%.
        const rtp = plinkoRTP(rows, risk);
        expect(Math.abs(rtp - 0.97), `${rows} ${risk}`).toBeLessThan(0.0017);
        expect(plinkoPays(rows, risk, 0.97)).toEqual(slots);
        // The pit boss moves every board alike, and its payback with it, exactly.
        const pays = plinkoPays(rows, risk, 0.9);
        expect(pays.reduce((sum, m, k) => sum + m * plinkoOdds(rows)[k]!, 0) * FEVER_LIFT).toBeCloseTo(plinkoPayback(rows, risk, 0.9), 12);
      }
    }
    // Higher risk, bigger edges.
    expect(plinkoSlots(16, 'high')[0]).toBe(1000);
    // Fever's ladder climbs, and its share of the payback is what the boards were drawn around.
    expect([...FEVER_LADDER]).toEqual([...FEVER_LADDER].sort((a, b) => a - b));
    expect(FEVER_LIFT).toBeCloseTo(1.08, 12);
    // Golden balls, for Fever, at their chance.
    const n = 400_000;
    let gold = 0;
    for (let round = 0; round < n; round++) if (isGolden({ run: 'f', round })) gold++;
    expect(Math.abs(gold / n - FEVER_CHANCE)).toBeLessThan(4.5 * Math.sqrt((FEVER_CHANCE * (1 - FEVER_CHANCE)) / n));
  });

  it('gives every ball of a round a path of its own, and replays it exactly', () => {
    const a = dropBall(12, { run: 'b', round: 1 }, 0);
    expect(dropBall(12, { run: 'b', round: 1 }, 0)).toEqual(a);
    expect(a.path).toHaveLength(12);
    expect(a.slot).toBe(a.path.filter((s) => s === 1).length);
    const others = Array.from({ length: 20 }, (_, i) => dropBall(12, { run: 'b', round: 1 }, i + 1).path.join(''));
    expect(new Set(others).size).toBeGreaterThan(15);
  });
});

describe('keno', () => {
  it('draws 20 different balls from 1 to 80, and replays them exactly', () => {
    const balls = kenoDraw({ run: 'k', round: 3 });
    expect(balls).toHaveLength(KENO_DRAWN);
    expect(new Set(balls).size).toBe(KENO_DRAWN);
    expect(balls.every((b) => b >= 1 && b <= KENO_NUMBERS)).toBe(true);
    expect(kenoDraw({ run: 'k', round: 3 })).toEqual(balls);
    expect(kenoDraw({ run: 'k', round: 4 })).not.toEqual(balls);
    const pick = kenoQuickPick(7, { run: 'k', round: 3 });
    expect(new Set(pick).size).toBe(7);
    expect(pick).toEqual([...pick].sort((a, b) => a - b));
  });

  it('catches each number of hits as often as the hypergeometric says', () => {
    const spots = [3, 17, 25, 40, 41, 66];
    const odds = kenoOdds(spots.length);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const n = 100_000;
    const counts = Array<number>(spots.length + 1).fill(0);
    let gold = 0;
    for (let round = 0; round < n; round++) {
      const r = kenoSettle(spots, kenoDraw({ run: 'h', round }), 0.97);
      counts[r.hits.length]!++;
      if (r.gold) gold++;
    }
    odds.forEach((p, k) => expect(Math.abs(counts[k]! / n - p), `${k} hits`).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n) + 1e-9));
    // The gold ball is any one ball in 80: one of six spots 6/80 of the time.
    const p = spots.length / KENO_NUMBERS;
    expect(Math.abs(gold / n - p)).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n));
  });

  it('pays back exactly the floor’s payback on every ticket, gold ball included', () => {
    for (let spots = 1; spots <= KENO_MAX_SPOTS; spots++) {
      for (const rtp of [0.9, 0.97]) expect(kenoPayback(spots, rtp), `${spots} spots`).toBeCloseTo(rtp, 12);
      // More hits never pays less, and catching every spot pays the most.
      const pays = kenoPays(spots, 0.97);
      const won = pays.slice(1);
      expect(won).toEqual([...won].sort((a, b) => a - b));
      expect(pays[spots]).toBe(Math.max(...pays));
    }
    // And in play: a ticket's average win over many draws comes to it. (Big tickets' tops are too rare to sample fairly.)
    for (const spots of [1, 2, 4]) {
      const pick = kenoQuickPick(spots, { run: 'q', round: spots });
      const pays: number[] = [];
      for (let round = 0; round < 200_000; round++) pays.push(kenoSettle(pick, kenoDraw({ run: 'p' + spots, round }), 0.97).pay);
      const { mean, se } = stats(pays);
      expect(Math.abs(mean - 0.97), `${spots} spots`).toBeLessThan(4.5 * se);
    }
  });

  it('multiplies a win when the gold ball, the last one drawn, is a spot', () => {
    const balls = kenoDraw({ run: 'g', round: 1 });
    const last = balls[KENO_DRAWN - 1]!;
    const plain = kenoSettle([balls[0]!], balls, 0.97);
    const golden = kenoSettle([last], balls, 0.97);
    expect(plain.gold).toBe(false);
    expect(golden.gold).toBe(true);
    expect(golden.pay).toBeCloseTo(plain.pay * GOLD_BALL_X, 12);
    const miss = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).find((x) => !balls.includes(x))!;
    expect(kenoSettle([miss], balls, 0.97)).toEqual({ hits: [], gold: false, pay: 0 });
  });
});

describe('the Gold Card', () => {
  it('stamps the gold ball and the ticket’s catches, finishes rows, and fills', () => {
    const balls = kenoDraw({ run: 'c', round: 2 });
    const gold = balls[KENO_DRAWN - 1]!;
    const ticket = [balls[0]!, balls[5]!, 80 - (balls.includes(80) ? 1 : 0)];
    const r = kenoStamp(new Set(), ticket, balls);
    const caught = ticket.filter((n) => balls.includes(n));
    expect(new Set(r.stamped)).toEqual(new Set([...caught, gold]));
    expect(r.rows).toEqual([]);
    expect(r.full).toBe(false);
    // A row one short: the draw that brings its last number finishes it.
    const row = kenoRow(gold);
    const almost = new Set(Array.from({ length: 10 }, (_, i) => row * 10 + i + 1).filter((n) => n !== gold));
    expect(kenoStamp(almost, [], balls).rows).toEqual([row]);
    // A card one short of full.
    const nearly = new Set(Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).filter((n) => n !== gold));
    expect(kenoStamp(nearly, [], balls)).toMatchObject({ stamped: [gold], full: true });
    // Nothing is stamped twice.
    expect(kenoStamp(new Set([gold]), [gold], balls).stamped).toEqual([]);
  });

  it('leaves the ticket and the pots together paying the floor’s payback', () => {
    for (let spots = 1; spots <= KENO_MAX_SPOTS; spots++) {
      const ticket = kenoPayback(spots, kenoTicketRtp(0.97, spots));
      expect(ticket * (1 + kenoBuffShare(spots)) + KENO_ROW_SHARE + KENO_CARD_SHARE, `${spots} spots`).toBeCloseTo(0.97, 12);
    }
  });
});

describe('pattern meters', () => {
  it('finds each pattern on the board', () => {
    expect(kenoPatterns([33, 34, 35, 36, 37]).run).toEqual([33, 34, 35, 36, 37]);
    // Five across the end of one row and the start of the next is no run.
    expect(kenoPatterns([8, 9, 10, 11, 12]).run).toBeUndefined();
    expect(kenoPatterns([4, 14, 24, 34, 44, 54]).tower).toEqual([4, 14, 24, 34, 44, 54]);
    expect(kenoPatterns([41, 43, 45, 46, 47, 49, 50]).crowd).toHaveLength(7);
    expect(kenoPatterns([1, 10, 80]).corners).toEqual([1, 10, 80]);
    expect(kenoPatterns([1, 10, 33])).toEqual({});
  });

  it('turns up as often as the exact counts say', () => {
    const n = 400_000;
    const seen = { run: 0, tower: 0, crowd: 0, corners: 0 };
    for (let round = 0; round < n; round++) for (const k of Object.keys(kenoPatterns(kenoDraw({ run: 'pm', round })))) seen[k as keyof typeof seen]++;
    for (const [k, p] of Object.entries(KENO_PATTERN_ODDS)) expect(Math.abs(seen[k as keyof typeof seen] / n - p), k).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n));
    // About one buff in 50 paid draws, all four meters together.
    const rate = KENO_BUFFS.reduce((sum, d) => sum + kenoBuffRate(d), 0);
    expect(1 / rate).toBeGreaterThan(45);
    expect(1 / rate).toBeLessThan(60);
  });

  it('fills meters on paid draws only, queues buffs, and runs the first down a draw at a time', () => {
    const run = [33, 34, 35, 36, 37, 1, 2];
    let state: KenoBuffState = KENO_BUFF_START;
    const steps = KENO_BUFFS.find((d) => d.kind === 'double')!.steps;
    for (let i = 0; i < steps - 1; i++) state = kenoAfterDraw(state, run, true).state;
    expect(state.meters.run).toBe(steps - 1);
    expect(kenoAfterDraw(state, run, false).state.meters.run).toBe(steps - 1);
    const full = kenoAfterDraw(state, run, true);
    expect(full.granted).toEqual(['double']);
    expect(full.state.meters.run).toBe(0);
    expect(full.state.queue).toEqual([{ kind: 'double', left: 5 }]);
    expect(kenoAfterDraw(full.state, [], true).state.queue).toEqual([{ kind: 'double', left: 4 }]);
  });

  it('prices each buff exactly: a Free Spot and a Gold Rush add what they say', () => {
    const ticket = [5, 18, 27, 44, 62];
    const rtp = kenoTicketRtp(0.97, ticket.length);
    for (const kind of ['freeSpot', 'goldRush'] as const) {
      const n = 200_000;
      let plain = 0;
      let buffed = 0;
      for (let round = 0; round < n; round++) {
        const seed = { run: 'bv' + kind, round };
        const balls = kenoDraw(seed);
        plain += kenoSettle(ticket, balls, rtp).pay;
        buffed += kenoSettle(ticket, balls, rtp, kenoBuffOnDraw(kind, ticket, seed)).pay;
      }
      const expected = kenoBuffValue(kind, ticket.length);
      expect(Math.abs(buffed / plain - 1 - expected), kind).toBeLessThan(0.12 * expected);
    }
    expect(kenoBuffOnDraw('goldRush', ticket, { run: 'x', round: 1 }).goldX).toBe(KENO_GOLD_RUSH_X);
  });

  it('pays back the ticket and its buffs together, draw after draw, as the exact sum says', () => {
    const ticket = [12, 47];
    const rtp = kenoTicketRtp(0.97, ticket.length);
    let state: KenoBuffState = KENO_BUFF_START;
    let paid = 0;
    let staked = 0;
    const pays: number[] = [];
    for (let round = 0; round < 400_000; round++) {
      const seed = { run: 'loop', round };
      const balls = kenoDraw(seed);
      const buff = kenoBuffOnDraw(state.queue[0]?.kind, ticket, seed);
      const pay = kenoSettle(ticket, balls, rtp, buff).pay;
      if (!buff.onHouse) staked++;
      paid += pay;
      pays.push(pay);
      state = kenoAfterDraw(state, balls, !buff.onHouse).state;
    }
    const target = 0.97 - KENO_ROW_SHARE - KENO_CARD_SHARE;
    const { se } = stats(pays);
    expect(Math.abs(paid / staked - target)).toBeLessThan(5 * se * 1.1);
  });
});
