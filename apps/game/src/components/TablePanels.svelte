<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte';
  import type { BreakdownLine } from '../lib/breakdown';
  import { floor } from '../lib/floor.svelte';
  import { formatMoney, type Decimal } from '../lib/money';
  import { formatLimit } from '../lib/rooms';
  import type { SpeedControl } from '../lib/sequencer.svelte';
  import { meta } from '../lib/meta.svelte';
  import { ui, type PanelTab } from '../lib/ui.svelte';
  import AutoDialog from './AutoDialog.svelte';
  import BlindBetsPanel from './BlindBetsPanel.svelte';
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
    /** What auto play follows at this table (a raise plan), in the auto play window under the shared rules. */
    automation?: Snippet;
    /** The table's own options, in the Table tab. */
    options?: Snippet;
    /** A record of the table's own, at the top of the Stats tab (a baccarat scoreboard). */
    record?: Snippet;
    /** The table's blind hands and the player's bets, for setting how the extra hands bet. */
    blind?: ComponentProps<typeof BlindBetsPanel>;
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
    record,
    blind,
  }: Props = $props();

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'pays', label: 'Pays' },
    { id: 'stats', label: 'Stats' },
    { id: 'charms', label: 'Charms' },
    { id: 'table', label: 'Table' },
  ];
  /** Charms on, for the Charms tab's count. */
  const charmsOn = $derived(meta.equipped.length);
</script>

<!--
  A table's sidebar, one view at a time: the pays, the session, how the table
  runs itself, the charms on, and the table's own details. Settings for the
  whole casino live in the Settings panel.
-->
<!-- Opened from the auto controls by the table's buttons; it lives here, with the game's own auto settings. -->
<AutoDialog {seq} {autoPlay} {onAuto} {automation} />

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
      {#if tab.id === 'charms' && charmsOn}<small>{charmsOn}</small>{/if}
    </button>
  {/each}
</div>

<div class="view" role="tabpanel" id="view-{ui.tab}" aria-labelledby="tab-{ui.tab}">
  {#if ui.tab === 'pays'}
    {#if blind}<BlindBetsPanel {...blind} />{/if}
    {@render children?.()}
  {:else if ui.tab === 'charms'}
    <CharmsPanel />
  {:else if ui.tab === 'stats'}
    {@render record?.()}
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
  /* Tabs: a segmented strip on the rail, the open one in gold. */
  .tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
    padding: 4px;
    border-radius: 12px;
    background: var(--rail);
  }
  .tabs button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 34px;
    min-width: 0;
    padding: 0 2px;
    border: 0;
    border-radius: 8px;
    background: none;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tabs small {
    padding: 1px 5px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    font: 600 10px/1.2 var(--font-ui);
    letter-spacing: 0;
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
