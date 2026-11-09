<script lang="ts">
  import { untrack, type ComponentProps, type Snippet } from 'svelte';
  import type { BreakdownLine } from '../lib/breakdown';
  import { floor } from '../lib/floor.svelte';
  import { Decimal, formatMoney } from '../lib/money';
  import { formatLimit } from '../lib/rooms';
  import type { SpeedControl } from '../lib/sequencer.svelte';
  import { meta } from '../lib/meta.svelte';
  import { route } from '../lib/route.svelte';
  import { ui, type PanelTab } from '../lib/ui.svelte';
  import { wins, type WinRecord } from '../lib/wins.svelte';
  import AutoDialog from './AutoDialog.svelte';
  import BlindBetsPanel from './BlindBetsPanel.svelte';
  import Breakdown from './Breakdown.svelte';
  import CharmStrip from './charms/CharmStrip.svelte';

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
    /**
     * For a game that can draw a round again: `data` is what it needs to
     * replay the round that just settled (kept with the win), `play` draws a
     * kept win again, and `busy` holds the replay buttons while it can't.
     */
    replay?: { data: unknown; play: (data: unknown) => void; busy: boolean };
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
    replay,
  }: Props = $props();

  /*
   * The last wins: each round that settles in the black joins the list, with
   * the game's replay data if it has any. A history entry is told apart from
   * the last by its round, text and net, so a re-render never records it twice.
   */
  const keyOf = (h: Props['history'][number] | undefined) => (h ? `${h.round}|${h.text}|${h.net.toString()}` : '');
  let lastKey = untrack(() => keyOf(history[0]));
  $effect(() => {
    const h = history[0];
    const key = keyOf(h);
    if (!h || key === lastKey) return;
    lastKey = key;
    if (!h.net.gt(0)) return;
    untrack(() =>
      wins.record(route.current ?? 'table', {
        round: h.round,
        text: h.text,
        sub: h.sub,
        net: h.net.toString(),
        unit: lastUnit.toString(),
        at: Date.now(),
        replay: replay?.data ? $state.snapshot(replay.data) : undefined,
      }),
    );
  });
  const myWins = $derived(wins.list(route.current ?? 'table'));
  const fmtX = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
  function play(w: WinRecord) {
    if (replay && w.replay !== undefined && !replay.busy) replay.play(w.replay);
  }

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'pays', label: 'Pays' },
    { id: 'stats', label: 'Stats' },
    { id: 'table', label: 'Table' },
  ];
  /** Tokens earned since sitting down here: the lifetime count when the table opened, and now. */
  const tokensAtSit = untrack(() => meta.lifetimeTokens);
  const tokensHere = $derived(meta.lifetimeTokens - tokensAtSit);
  /** The last round's result in money, from its breakdown. */
  const lastMoney = $derived(last ? lastUnit.mul(last.net) : null);
</script>

<!--
  A table's sidebar, one view at a time: the pays, the session, how the table
  runs itself, the charms on, and the table's own details. Settings for the
  whole casino live in the Settings panel.
-->
<!-- Opened from the auto controls by the table's buttons; it lives here, with the game's own auto settings. -->
<AutoDialog {seq} {autoPlay} {onAuto} {automation} />

<!-- Always in view: the charms on, and how this visit is going. -->
<section class="panel live">
  <CharmStrip />
  <dl class="now">
    <div>
      <dt>Session</dt>
      <dd class:win={sessionNet.gt(0)} class:loss={sessionNet.lt(0)}>{formatMoney(sessionNet, true)}</dd>
    </div>
    <div>
      <dt>Last</dt>
      <dd class:win={!!lastMoney?.gt(0)} class:loss={!!lastMoney?.lt(0)}>{lastMoney ? formatMoney(lastMoney, true) : '—'}</dd>
    </div>
    <div>
      <dt>Tokens</dt>
      <dd class="tok">+{tokensHere < 10 ? tokensHere.toFixed(1) : Math.round(tokensHere).toLocaleString('en-US')}</dd>
    </div>
  </dl>
</section>

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
    {#if blind}<BlindBetsPanel {...blind} />{/if}
    {@render children?.()}
  {:else if ui.tab === 'stats'}
    {@render record?.()}
    <section class="panel">
      <h2>Last hand</h2>
      <Breakdown lines={last?.lines ?? []} net={last?.net ?? null} ante={lastUnit} />
    </section>

    <section class="panel wins">
      <h2>Last {myWins.length || ''} wins {#if replay}<span class="muted">tap ▶ to replay</span>{/if}</h2>
      {#if myWins.length}
        <ol>
          {#each myWins as w (`${w.at}:${w.round}`)}
            {@const x = wins.times(w)}
            {@const can = !!replay && w.replay !== undefined}
            <li>
              <button type="button" disabled={!can || replay?.busy} onclick={() => play(w)} aria-label={can ? `Replay ${w.text}` : w.text}>
                <span class="x" class:big={x >= 10}>+{fmtX(x)}×</span>
                <span class="what">{w.text}{w.sub ? ` · ${w.sub}` : ''}</span>
                <span class="amt">{formatMoney(new Decimal(w.net), true)}</span>
                <span class="play" aria-hidden="true">{can ? '▶' : ''}</span>
              </button>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted small">Your wins land here, newest first{replay ? '. Any of them can be drawn again exactly' : ''}.</p>
      {/if}
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  /* The last wins: newest first, each a button that replays it where the game can. */
  .wins ol {
    display: grid;
    gap: 3px;
    max-height: 320px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .wins h2 {
    display: flex;
    justify-content: space-between;
  }
  .wins h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .wins button {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto 12px;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 0;
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.03);
    text-align: left;
    font: 12px/1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .wins button:disabled {
    opacity: 1;
    cursor: default;
  }
  .wins button:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.09);
  }
  .wins .x {
    font-weight: 700;
    color: #8cf0b8;
  }
  .wins .x.big {
    color: var(--gold);
  }
  .wins .what {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wins .amt {
    color: #8cf0b8;
  }
  .wins .play {
    color: var(--muted);
    font-size: 10px;
  }
  /* The always-on strip: charms, then the visit's numbers in three cells. */
  .live {
    gap: 10px;
  }
  .now {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .now div {
    display: grid;
    gap: 3px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.22);
  }
  .now dt {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .now dd {
    text-align: left;
    font: 700 15px/1.1 var(--font-display);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now .tok {
    color: #f2d27a;
  }
</style>
