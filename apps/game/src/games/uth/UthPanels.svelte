<script lang="ts">
  import { Category, CATEGORY_NAMES } from '@idlesuits/sim';
  import PayTable from '../../components/PayTable.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import { formatMoney } from '../../lib/money';
  import type { UthGame } from './game.svelte';

  let { game }: { game: UthGame } = $props();

  const ratio = (n: number) => (n === 1.5 ? '3:2' : `${n}:1`);
  const rowsFor = (table: Partial<Record<Category, number>>) =>
    Object.entries(table)
      .map(([c, pays]) => ({ category: Number(c) as Category, pays: pays! }))
      .sort((a, b) => b.category - a.category)
      .map(({ category, pays }) => ({ label: CATEGORY_NAMES[category], pays: ratio(pays) }));

  const lit = $derived(
    game.playerHand && game.net !== null && !game.folded ? CATEGORY_NAMES[game.playerHand.category] : undefined,
  );
</script>

<TablePanels
  seq={game.seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  seed={game.runSeed}
  round={game.round}
  last={game.last}
  lastUnit={game.lastAnte}
  stats={[
    ['Hands', String(game.hands)],
    ['Folds', String(game.folds)],
    ['Biggest win', formatMoney(game.biggestWin)],
  ]}
  sessionNet={game.sessionNet}
  history={game.history.map((h) => ({ round: h.round, text: h.player, sub: `v ${h.dealer}`, net: h.net }))}
>
  <section class="panel">
    <h2>Your bets <span>set with chips on the felt</span></h2>
    <p class="note">
      Ante {formatMoney(game.ante)} and a matching Blind. The Play bet is 4× or 3× the Ante before the flop, 2× after
      it, or 1× at the end. Max at risk: {formatMoney(game.ante.mul(6).add(game.side.total))}.
    </p>
  </section>

  <section class="panel">
    <PayTable title="Blind pays (when you win)" rows={rowsFor(game.rules.blindPays)} {lit} />
  </section>

  <SideBetsPanel stakes={game.side} base={game.ante} results={game.bonusResults} />
</TablePanels>

<style>
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
</style>
