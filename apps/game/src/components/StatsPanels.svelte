<script lang="ts">
  import { SUIT_SYMBOL } from '@idlesuits/sim';
  import type { SpeedMode } from '../lib/director';
  import type { Game } from '../lib/game.svelte';
  import { formatMoney } from '../lib/money';
  import Breakdown from './Breakdown.svelte';

  interface Props {
    game: Game;
    muted: boolean;
    onMuteChange: (muted: boolean) => void;
  }

  let { game, muted, onMuteChange }: Props = $props();

  const view = $derived(game.view);
  const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
</script>

<section>
  <h2>Last hand</h2>
  <Breakdown lines={view.last?.lines ?? []} net={view.last?.net ?? null} ante={game.lastAnte} />
</section>

<section>
  <h2>Session</h2>
  <dl>
    <dt>Hands</dt>
    <dd>{game.hands}</dd>
    <dt>Net</dt>
    <dd class:win={game.sessionNet.gt(0)} class:loss={game.sessionNet.lt(0)}>{formatMoney(game.sessionNet, true)}</dd>
    <dt>Biggest win</dt>
    <dd>{formatMoney(game.biggestWin)}</dd>
    {#each Object.entries(game.flushCounts).filter(([size]) => Number(size) >= 5) as [size, count] (size)}
      <dt>{size}-card flushes</dt>
      <dd>{count}</dd>
    {/each}
  </dl>
</section>

<section>
  <h2>Recent</h2>
  <ol class="history">
    {#each game.history as h (h.round)}
      <li>
        <span class="muted">#{h.round}</span>
        <span>{h.size}{SUIT_SYMBOL[h.suit]}</span>
        <span class="muted">{h.outcome === 'dealerNoQualify' ? 'no qual' : h.outcome}</span>
        <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{formatMoney(h.net, true)}</span>
      </li>
    {:else}
      <li class="muted">No hands yet.</li>
    {/each}
  </ol>
</section>

<section>
  <h2>Table</h2>
  <div class="speed" role="group" aria-label="Reveal speed">
    {#each SPEEDS as s (s)}
      <button type="button" aria-pressed={game.speed === s} onclick={() => (game.speed = s)}>{s}</button>
    {/each}
  </div>
  <label class="switch">
    <input type="checkbox" checked={muted} onchange={(e) => onMuteChange(e.currentTarget.checked)} />
    Mute sound
  </label>
  <label class="switch">
    <input type="checkbox" bind:checked={game.dealerClaims} />
    Dealer claims open side bets
  </label>
  <p class="muted small">Seed {game.runSeed} · hand {game.round}</p>
  <button type="button" onclick={() => game.restart()}>Restart</button>
</section>

<style>
  section {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
  }
  h2 {
    margin: 0 0 8px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
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
    font: 13px/1.4 var(--font-ui);
  }
  .history li {
    display: grid;
    grid-template-columns: 44px 32px 1fr auto;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    width: fit-content;
    margin-bottom: 10px;
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
    margin: 0 0 8px;
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
