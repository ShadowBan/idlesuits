import {
  BACCARAT_BONUSES,
  BACCARAT_RULES,
  simulateBaccaratRound,
  type BaccaratEvent,
  type BaccaratRoundResult,
  type BaccaratSide,
} from '@idlesuits/sim';
import { mainBet, sideBets } from '../report';
import { registerTable, sidesDown, type TableAdapter } from '../tables';
import { rulesFor } from '../tuning';
import { cutRange, shoeAt, shoeForRound, type ShoePlace } from './shoe';

interface BacData {
  round: number;
  side: BaccaratSide;
  bonuses: Record<string, number>;
  shoe: ShoePlace;
  shuffled: boolean;
}

/**
 * Punto Banco, dealt from an eight-deck shoe kept across coups, its order the
 * engine's secret. A coup has no decisions: it's decided as it's dealt, and
 * the player turning their cards over is only how it's shown.
 */
export const baccarat: TableAdapter<never, never, BaccaratEvent, BaccaratRoundResult> = {
  game: 'baccarat',
  blindMain: 0,
  sides: () => BACCARAT_BONUSES.map((b) => b.id),
  open(state, req, _seed, ctx) {
    const rules = rulesFor(ctx.tuning, 'baccarat', BACCARAT_RULES);
    const saved = (state.games.baccarat as Record<string, unknown> | undefined)?.shoe;
    const { place, shuffled } = shoeForRound('baccarat', saved, rules.decks, ctx);
    const side = req.options?.side === 'player' ? 'player' : 'banker';
    const unit = Number(req.bet);
    const bonuses = Object.fromEntries(
      Object.entries(req.sides ?? {})
        .filter(([, v]) => Number(v) > 0)
        .map(([id, v]) => [id, Number(v) / unit]),
    );
    const data: BacData = { round: (req as unknown as { round: number }).round, side, bonuses, shoe: place, shuffled };
    return { data: data as unknown as Record<string, unknown>, down: 1 + sidesDown(bonuses) };
  },
  step(raw, _choices, ctx) {
    const data = raw as unknown as BacData;
    const rules = rulesFor(ctx.tuning, 'baccarat', BACCARAT_RULES);
    const shoe = shoeAt('baccarat', data.shoe, cutRange('baccarat', ctx), ctx);
    const result = simulateBaccaratRound({ rules, seed: { run: ctx.seed('baccarat', data.round), round: data.round }, side: data.side, bonuses: data.bonuses, shoe, recordEvents: true });
    return { kind: 'done', events: result.events, result };
  },
  offer: (d) => d,
  cost: () => null,
  suggest: (d) => d,
  report(result, raw) {
    const data = raw as unknown as BacData;
    return {
      report: {
        bets: [...mainBet(1, result.main), ...sideBets(result.bonuses, data.bonuses)],
        outcome: result.winner === 'tie' ? 'push' : result.main > 0 ? 'win' : 'lose',
      },
      net: result.net,
      text: `${result.winner === 'tie' ? 'Tie' : result.winner === 'player' ? 'Player' : 'Banker'} ${Math.max(result.playerTotal, result.bankerTotal)}`,
      sub: `${result.playerTotal} – ${result.bankerTotal}`,
    };
  },
  info(raw, ctx) {
    const data = raw as unknown as BacData;
    const shoe = shoeAt('baccarat', data.shoe, cutRange('baccarat', ctx), ctx);
    return { shuffled: data.shuffled, shoe: { size: shoe.cards.length, next: data.shoe.next, cut: shoe.cut } };
  },
  after(progress, raw, result) {
    const data = raw as unknown as BacData;
    return { ...progress, shoe: { ...data.shoe, next: data.shoe.next + result.cardsUsed } };
  },
};

registerTable(baccarat);
