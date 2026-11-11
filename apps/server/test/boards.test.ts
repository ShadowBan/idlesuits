import { Decimal, freshPlayer, type PlayerState } from '@idlesuits/engine';
import { describe, expect, it } from 'vitest';
import { record, rows, sortKey, weekOf } from '../src/boards';

describe('the leaderboards', () => {
  it('name each week by its Monday, in UTC', () => {
    expect(weekOf(Date.UTC(2026, 10, 11, 12))).toBe('w2026-11-09'); // a Wednesday
    expect(weekOf(Date.UTC(2026, 10, 9, 0))).toBe('w2026-11-09'); // the Monday itself
    expect(weekOf(Date.UTC(2026, 10, 8, 23, 59))).toBe('w2026-11-02'); // the Sunday before
  });

  it('order amounts of any size, losses below wins', () => {
    const keys = ['-1e400', '-5', '0', '7', '1e14', '1e20', '1e400'].map((v) => sortKey(new Decimal(v)));
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });

  it('keeps bests, adds up net and Tokens, and sends a new best at once but totals only every few minutes', () => {
    const before: PlayerState = { ...freshPlayer('s'), bank: '500' };
    const t0 = Date.UTC(2026, 10, 11);
    const won = record(before, { ...before, bank: '600', meta: { ...before.meta, lifetimeTokens: 4 } }, { rounds: 3, biggest: { money: '120', text: '4 of 5', game: 'keno' }, bestX: { x: 24, text: '4 of 5', game: 'keno' }, tokens: 4 }, t0);
    expect(won.push).toBe(true);
    expect(won.boards.weekly.win?.money).toBe('120');
    expect(won.boards.all.net).toBe('100');
    const sent = rows(won.boards, { id: 'u', name: 'Carol' }, t0);
    expect(sent.rows.map((r) => `${r.board}|${r.period}`).sort()).toEqual(['net|all', 'net|w2026-11-09', 'tokens|all', 'tokens|w2026-11-09', 'win|all', 'win|w2026-11-09', 'x|all', 'x|w2026-11-09']);
    // A smaller win a minute later: the net moves, but nothing goes until five minutes are up.
    const after = { ...before, bank: '600', boards: sent.clean } as PlayerState;
    const small = record(after, { ...after, bank: '580' }, { rounds: 1, biggest: null, bestX: null, tokens: 0 }, t0 + 60_000);
    expect(small.push).toBe(false);
    expect(small.boards.all.net).toBe('80');
    expect(record(after, { ...after, bank: '580' }, { rounds: 1, biggest: null, bestX: null, tokens: 0 }, t0 + 6 * 60_000).push).toBe(true);
  });

  it('starts the weekly records afresh each Monday, keeping the all-time ones', () => {
    const before: PlayerState = { ...freshPlayer('s'), bank: '500' };
    const t0 = Date.UTC(2026, 10, 11);
    const first = record(before, { ...before, bank: '600' }, { rounds: 1, biggest: { money: '100', text: 'x', game: 'keno' }, bestX: null, tokens: 0 }, t0);
    const next = { ...before, bank: '600', boards: first.boards } as PlayerState;
    const later = record(next, { ...next, bank: '610' }, { rounds: 1, biggest: { money: '10', text: 'y', game: 'keno' }, bestX: null, tokens: 0 }, t0 + 7 * 86_400_000);
    expect(later.boards.weekly.win?.money).toBe('10');
    expect(later.boards.all.win?.money).toBe('100');
    expect(later.boards.weekly.net).toBe('10');
  });
});
