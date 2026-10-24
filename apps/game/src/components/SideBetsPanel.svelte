<script lang="ts">
  import type { BonusResult } from '@idlesuits/sim';
  import { formatMoney, type Decimal } from '../lib/money';
  import { formatEdge, type SideStakes } from '../lib/sidebets.svelte';
  import PayTable from './PayTable.svelte';

  interface Props {
    stakes: SideStakes;
    /** Unused since bets moved onto the felt; kept so tables need not change at once. */
    base?: Decimal;
    /** Last hand's results by bet, to light the line that paid. */
    results: Record<string, BonusResult>;
  }

  let { stakes, results }: Props = $props();

  /** "8:1", or for a bet quoted for one, "9 for 1" (the stake is not returned on top). */
  const ratio = (n: number, forOne?: boolean) =>
    forOne ? (n === 0 ? 'push' : `${(n + 1).toLocaleString('en-US')} for 1`) : `${n.toLocaleString('en-US')}:1`;
</script>

<section class="panel">
  <h2>Side bets <span>set with chips on the felt</span></h2>
  {#each stakes.bets as bet (bet.id)}
    {@const stake = stakes.amount(bet.id)}
    {@const result = results[bet.id]}
    <div class="bet" class:on={stake.gt(0)}>
      <div class="row">
        <span class="name">{bet.name}</span>
        <b class="stake" class:off={stake.eq(0)}>{stake.gt(0) ? formatMoney(stake) : 'Off'}</b>
      </div>
      <p class="blurb">{bet.blurb} <span class="edge">House edge {formatEdge(bet.edge)}</span></p>
      <details open={stake.gt(0) || (result?.row ?? -1) >= 0}>
        <summary>Pay table</summary>
        <PayTable
          rows={bet.rows.map((r) => ({ label: r.label, pays: ratio(r.pays, bet.forOne) }))}
          lit={result && result.row >= 0 ? bet.rows[result.row]!.label : undefined}
        />
      </details>
    </div>
  {/each}
</section>

<style>
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 12px;
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
    text-align: right;
  }
  .bet {
    display: grid;
    gap: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .bet:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font: 600 14px/1.2 var(--font-ui);
  }
  .bet:not(.on) .name {
    color: var(--muted);
  }
  .stake {
    font: 700 15px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .stake.off {
    color: var(--muted);
  }
  .blurb {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .edge {
    white-space: nowrap;
    color: var(--ink);
    opacity: 0.8;
  }
  summary {
    cursor: pointer;
    font: 600 11px/1.6 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  details[open] summary {
    margin-bottom: 4px;
  }
</style>
