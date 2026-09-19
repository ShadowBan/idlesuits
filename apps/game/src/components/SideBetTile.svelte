<script lang="ts">
  import type { SideBetDef } from '@idlesuits/sim';
  import { formatMoney, type Decimal } from '../lib/money';
  import type { SideBetView } from '../lib/table.svelte';

  interface Props {
    def: SideBetDef;
    view: SideBetView | undefined;
    claimed: boolean;
    dealerClaims: boolean;
    ante: Decimal;
    onToggle: () => void;
  }

  let { def, view, claimed, dealerClaims, ante, onToggle }: Props = $props();

  const owner = $derived(view?.owner ?? (claimed ? 'player' : dealerClaims ? 'dealer' : 'none'));
  const nextOwner = $derived(claimed ? 'player' : dealerClaims ? 'dealer' : 'none');
  const pct = $derived(view ? Math.min(1, view.progress / view.target) : 0);
  const hot = $derived(view && view.owner !== 'none' && view.net === null && view.progress >= view.target - 1);
  const paysSummary = $derived(
    Object.entries(def.pays.values)
      .map(([k, v]) => `${k}:${v}`)
      .join(' · '),
  );
</script>

<article class="tile {owner}" class:hot class:hit={view?.livePays && view.owner !== 'none'}>
  <header>
    <h3>{def.name}</h3>
    <span class="owner">{owner === 'none' ? 'Open' : owner}</span>
  </header>

  {#if view && view.owner !== 'none'}
    <div class="meter" aria-label="Progress {view.progress} of {view.target}">
      <div class="fill" style:width="{pct * 100}%"></div>
    </div>
    <p class="progress">
      {view.progress} / {view.target}
      {#if view.livePays > 0}<b>pays {view.livePays}:1</b>{/if}
    </p>
  {:else}
    <p class="progress muted">{def.metric === 'flushSize' ? 'Flush size' : 'Straight flush'} · {paysSummary}</p>
  {/if}

  {#if view?.net != null && view.owner !== 'none'}
    <p class="result" class:win={view.net > 0} class:loss={view.net < 0}>
      {view.net === 0 ? 'Miss' : formatMoney(ante.mul(view.net), true)}
    </p>
  {/if}

  <button type="button" onclick={onToggle} aria-pressed={claimed}>
    {claimed ? 'Claimed' : 'Claim'} next hand
    <span class="muted">({nextOwner === 'player' ? 'you' : nextOwner === 'dealer' ? 'dealer' : 'nobody'})</span>
  </button>
</article>

<style>
  .tile {
    --own: var(--muted);
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    min-width: 0;
    border-radius: 10px;
    border: 2px solid color-mix(in srgb, var(--own) 55%, transparent);
    background: color-mix(in srgb, var(--own) 10%, var(--felt-deep));
    transition:
      border-color 200ms,
      box-shadow 200ms;
  }
  .tile.player {
    --own: var(--player);
  }
  .tile.dealer {
    --own: var(--dealer);
  }
  .tile.hot {
    box-shadow: 0 0 0 2px var(--own), 0 0 18px var(--own);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
  }
  h3 {
    margin: 0;
    font: 600 14px/1.2 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .owner {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--own);
  }
  .meter {
    height: 6px;
    border-radius: 3px;
    background: var(--chip-bg);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--own);
    transition: width 200ms ease-out;
  }
  p {
    margin: 0;
    font: 13px/1.3 var(--font-ui);
  }
  .progress b {
    color: var(--gold);
    margin-left: 6px;
  }
  .muted {
    color: var(--muted);
  }
  .result {
    font-weight: 700;
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
  button {
    justify-self: start;
    font: 500 12px/1 var(--font-ui);
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  button[aria-pressed='true'] {
    background: color-mix(in srgb, var(--player) 25%, transparent);
    border-color: var(--player);
  }
</style>
