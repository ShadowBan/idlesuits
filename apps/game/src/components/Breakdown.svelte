<script lang="ts">
  import { formatMoney, type Decimal } from '../lib/money';
  import type { BreakdownLine } from '../lib/table.svelte';

  interface Props {
    lines: BreakdownLine[];
    net: number | null;
    ante: Decimal;
  }

  let { lines, net, ante }: Props = $props();
</script>

<table>
  <tbody>
    {#each lines as line, i (i)}
      <tr>
        <td>{line.label}</td>
        <td class:win={line.amount > 0} class:loss={line.amount < 0}>{formatMoney(ante.mul(line.amount), true)}</td>
      </tr>
    {:else}
      <tr><td class="muted">No hands played yet.</td></tr>
    {/each}
  </tbody>
  {#if net !== null}
    <tfoot>
      <tr>
        <td>Total</td>
        <td class:win={net > 0} class:loss={net < 0}>{formatMoney(ante.mul(net), true)}</td>
      </tr>
    </tfoot>
  {/if}
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font: 13px/1.4 var(--font-ui);
  }
  td {
    padding: 3px 0;
  }
  td:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  tfoot td {
    border-top: 1px solid var(--line);
    padding-top: 6px;
    font-weight: 700;
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
  .muted {
    color: var(--muted);
  }
</style>
