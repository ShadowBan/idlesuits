<script lang="ts">
  import { Category, CATEGORY_NAMES } from '@idlesuits/sim';
  import Breakdown from '../../components/Breakdown.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import { formatMoney } from '../../lib/money';
  import { SPEEDS } from '../../lib/sequencer.svelte';
  import type { UthGame } from './game.svelte';

  interface Props {
    game: UthGame;
    muted: boolean;
    onMuteChange: (muted: boolean) => void;
  }

  let { game, muted, onMuteChange }: Props = $props();

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

<section class="panel">
  <h2>Bets <span>apply to the next hand</span></h2>
  <div class="row">
    <span>Ante <small>and Blind</small></span>
    <span class="stepper">
      <button type="button" onclick={() => game.changeAnte(0.5)} aria-label="Halve ante">−</button>
      <b>{formatMoney(game.ante)}</b>
      <button type="button" onclick={() => game.changeAnte(2)} aria-label="Double ante">+</button>
    </span>
  </div>
  <p class="note">The Blind always matches the Ante. Max at risk: {formatMoney(game.ante.mul(6).add(game.side.total))}.</p>
</section>

<section class="panel">
  <PayTable title="Blind pays (when you win)" rows={rowsFor(game.rules.blindPays)} {lit} />
</section>

<SideBetsPanel stakes={game.side} base={game.ante} results={game.bonusResults} />

<section class="panel">
  <h2>Last hand</h2>
  <Breakdown lines={game.last?.lines ?? []} net={game.last?.net ?? null} ante={game.lastAnte} />
</section>

<section class="panel">
  <h2>Session</h2>
  <dl>
    <dt>Hands</dt>
    <dd>{game.hands}</dd>
    <dt>Net</dt>
    <dd class:win={game.sessionNet.gt(0)} class:loss={game.sessionNet.lt(0)}>{formatMoney(game.sessionNet, true)}</dd>
    <dt>Biggest win</dt>
    <dd>{formatMoney(game.biggestWin)}</dd>
    <dt>Folds</dt>
    <dd>{game.folds}</dd>
  </dl>
  <ol class="history">
    {#each game.history as h (h.round)}
      <li>
        <span class="muted">#{h.round}</span>
        <span>{h.player}</span>
        <span class="muted">v {h.dealer}</span>
        <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{formatMoney(h.net, true)}</span>
      </li>
    {/each}
  </ol>
</section>

<section class="panel">
  <h2>Table</h2>
  <div class="speed" role="group" aria-label="Deal speed">
    {#each SPEEDS as s (s)}
      <button type="button" aria-pressed={game.seq.speed === s} onclick={() => (game.seq.speed = s)}>{s}</button>
    {/each}
  </div>
  <label class="switch">
    <input type="checkbox" checked={muted} onchange={(e) => onMuteChange(e.currentTarget.checked)} />
    Mute sound
  </label>
  <p class="muted small">Seed {game.runSeed} · hand {game.round}</p>
  <button type="button" onclick={() => game.restart()}>Restart</button>
</section>

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
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font: 13px/1.3 var(--font-ui);
  }
  .row small {
    color: var(--muted);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper button {
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 16px;
  }
  .stepper b {
    min-width: 56px;
    text-align: center;
    font: 700 15px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
    font: 13px/1.4 var(--font-ui);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    font: 12px/1.4 var(--font-ui);
  }
  .history li {
    display: grid;
    grid-template-columns: 36px 1fr auto auto;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    width: fit-content;
  }
  .speed button {
    border: 0;
    border-radius: 0;
    text-transform: capitalize;
  }
  .speed button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
</style>
