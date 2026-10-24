<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { BreakdownLine } from '../lib/breakdown';
  import { formatMoney, type Decimal } from '../lib/money';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';
  import Breakdown from './Breakdown.svelte';

  interface Props {
    seq: SpeedControl;
    muted: boolean;
    onMute: (muted: boolean) => void;
    seed: string;
    round: number;
    onRestart: () => void;
    last: { lines: BreakdownLine[]; net: number } | null;
    /** The bet unit the last hand's lines are counted in. */
    lastUnit: Decimal;
    /** Label and value pairs for the session box. */
    stats: [string, string][];
    sessionNet: Decimal;
    history: { round: number; text: string; sub?: string; net: Decimal }[];
    /** The game's own panels: pay tables, side bets. */
    children?: Snippet;
  }

  let { seq, muted, onMute, seed, round, onRestart, last, lastUnit, stats, sessionNet, history, children }: Props =
    $props();
</script>

{@render children?.()}

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
</section>

<section class="panel">
  <h2>Table</h2>
  <div class="speed" role="group" aria-label="Deal speed">
    {#each SPEEDS as s (s)}
      <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s}</button>
    {/each}
  </div>
  <label class="switch">
    <input type="checkbox" checked={muted} onchange={(e) => onMute(e.currentTarget.checked)} />
    Mute sound
  </label>
  <p class="muted small">Seed {seed} · hand {round}</p>
  <button type="button" onclick={onRestart}>Restart</button>
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
