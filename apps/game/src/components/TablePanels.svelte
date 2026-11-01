<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { BreakdownLine } from '../lib/breakdown';
  import { floor } from '../lib/floor.svelte';
  import { formatMoney, type Decimal } from '../lib/money';
  import { formatLimit } from '../lib/rooms';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';
  import { ui, type PanelTab } from '../lib/ui.svelte';
  import Breakdown from './Breakdown.svelte';
  import CharmsPanel from './charms/CharmsPanel.svelte';

  interface Props {
    seq: SpeedControl;
    autoPlay: boolean;
    onAuto: (on: boolean) => void;
    seed: string;
    round: number;
    last: { lines: BreakdownLine[]; net: number } | null;
    /** The bet unit the last hand's lines are counted in. */
    lastUnit: Decimal;
    /** Label and value pairs for the session box. */
    stats: [string, string][];
    sessionNet: Decimal;
    history: { round: number; text: string; sub?: string; net: Decimal }[];
    /** The Pays tab: the game's bets, pay tables and side bets. */
    children?: Snippet;
    /** Panels for what auto play follows at this table (a raise plan), right under Automation. */
    automation?: Snippet;
    /** The table's own options, in the Table tab. */
    options?: Snippet;
  }

  let {
    seq,
    autoPlay,
    onAuto,
    seed,
    round,
    last,
    lastUnit,
    stats,
    sessionNet,
    history,
    children,
    automation,
    options,
  }: Props = $props();

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'pays', label: 'Pays' },
    { id: 'stats', label: 'Stats' },
    { id: 'table', label: 'Table' },
  ];
</script>

<!--
  A table's sidebar: the charms on, then how the table runs itself, then one
  of three views. Settings for the whole casino live in the Settings panel.
-->
<CharmsPanel />

<section class="panel">
  <h2>Automation</h2>
  <label class="switch">
    <input type="checkbox" checked={autoPlay} onchange={(e) => onAuto(e.currentTarget.checked)} />
    Auto play
    <small>stops if you bust</small>
  </label>
  <div class="row">
    <span class="muted">Deal speed</span>
    <div class="speed" role="group" aria-label="Deal speed">
      {#each SPEEDS as s (s)}
        <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s}</button>
      {/each}
    </div>
  </div>
</section>

{@render automation?.()}

<div class="tabs" role="tablist" aria-label="Table information">
  {#each TABS as tab (tab.id)}
    <button
      type="button"
      role="tab"
      id="tab-{tab.id}"
      aria-selected={ui.tab === tab.id}
      aria-controls="view-{tab.id}"
      onclick={() => (ui.tab = tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<div class="view" role="tabpanel" id="view-{ui.tab}" aria-labelledby="tab-{ui.tab}">
  {#if ui.tab === 'pays'}
    {@render children?.()}
  {:else if ui.tab === 'stats'}
    <section class="panel">
      <h2>Last hand</h2>
      <Breakdown lines={last?.lines ?? []} net={last?.net ?? null} ante={lastUnit} />
    </section>

    <section class="panel">
      <h2>Session</h2>
      <dl>
        <dt>Net</dt>
        <dd class:win={sessionNet.gt(0)} class:loss={sessionNet.lt(0)}>{formatMoney(sessionNet, true)}</dd>
        {#each stats as [label, value] (label)}
          <dt>{label}</dt>
          <dd>{value}</dd>
        {/each}
      </dl>
      {#if history.length}
        <ol class="history">
          {#each history as h (h.round)}
            <li>
              <span class="muted">#{h.round}</span>
              <span>{h.text}</span>
              <span class="muted">{h.sub ?? ''}</span>
              <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{formatMoney(h.net, true)}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {:else}
    <section class="panel">
      <h2>{floor.room.name}</h2>
      <dl>
        <dt>Main bet</dt>
        <dd>{formatLimit(floor.room.min)} – {formatLimit(floor.room.max)}</dd>
        <dt>Side bets</dt>
        <dd>up to {formatLimit(floor.room.sideMax)}</dd>
        {#if floor.room.tokenBonus > 1}
          <dt>Tokens</dt>
          <dd>×{+floor.room.tokenBonus.toFixed(2)}</dd>
        {/if}
      </dl>
      <p class="muted small">Change rooms from the floor.</p>
    </section>

    {@render options?.()}

    <section class="panel">
      <h2>Deal</h2>
      <p class="muted small">Seed {seed} · hand {round}. Any hand can be dealt again exactly from its seed.</p>
    </section>
  {/if}
</div>

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
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 14px/1.3 var(--font-ui);
  }
  .switch small {
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font: 13px/1.3 var(--font-ui);
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .speed button {
    border: 0;
    border-radius: 0;
    padding: 5px 9px;
    text-transform: capitalize;
  }
  .speed button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  /* Tabs: a segmented strip on the rail, the open one in gold. */
  .tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--rail);
  }
  .tabs button {
    min-height: 34px;
    border: 0;
    border-radius: 8px;
    background: none;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tabs button[aria-selected='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .view {
    display: grid;
    gap: 12px;
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
