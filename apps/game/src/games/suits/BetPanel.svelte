<script lang="ts">
  import { DEFAULT_RAISE_CAPS, maxRaise } from '@idlesuits/sim';
  import { PLAN_SIZES, type Game } from './game.svelte';
  import { formatMoney } from '../../lib/money';

  let { game }: { game: Game } = $props();

  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
</script>

<section class="panel">
  <h2>
    Raise plan
    <span>{game.autoPlay ? 'used by Auto' : 'suggested in manual play'}</span>
  </h2>
  <table>
    <tbody>
      {#each PLAN_SIZES as size (size)}
        {@const cap = maxRaise(DEFAULT_RAISE_CAPS, size)}
        {@const current = game.raisePlan.raises[size] ?? 0}
        <tr>
          <th scope="row">{size === PLAN_SIZES.at(-1) ? `${size}+ card` : `${size}-card`}</th>
          <td>
            <div class="seg" role="group" aria-label="Raise with a {size}-card flush">
              {#each Array.from({ length: cap + 1 }, (_, i) => i) as raise (raise)}
                <button type="button" aria-pressed={current === raise} onclick={() => game.setPlanRaise(size, raise)}>
                  {raise === 0 ? 'Fold' : `${raise}×`}
                </button>
              {/each}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <label class="switch">
    <input type="checkbox" bind:checked={game.raisePlan.threeCardMinimum} />
    3-card flushes: only 10-8-6 or better
  </label>

  <label class="switch">
    <input type="checkbox" bind:checked={game.dealerClaims} />
    Dealer claims open side bets
  </label>

  <dl>
    <dt>Max at risk per hand</dt>
    <dd>{formatMoney(game.maxAtRisk)}{game.dealerClaims ? ' + dealer bets' : ''}</dd>
    <dt>Expected per hand</dt>
    <dd>
      {#if game.estimate}
        <span class:win={game.estimate.perHand.gt(0)} class:loss={game.estimate.perHand.lt(0)}>
          {formatMoney(game.estimate.perHand, true)}
        </span>
        <small>{pct(game.estimate.perWagered)} of wagers</small>
      {:else}
        …
      {/if}
    </dd>
  </dl>
</section>

<style>
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 8px;
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
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th {
    font: 500 13px/1 var(--font-ui);
    text-align: left;
    padding: 3px 8px 3px 0;
    white-space: nowrap;
  }
  td {
    padding: 3px 0;
  }
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    width: fit-content;
    margin-left: auto;
  }
  .seg button {
    border: 0;
    border-radius: 0;
    padding: 5px 9px;
    font-size: 12px;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    margin: 6px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font: 13px/1.4 var(--font-ui);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 11px;
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
</style>
