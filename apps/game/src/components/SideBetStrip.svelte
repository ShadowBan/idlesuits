<script lang="ts">
  import type { SideBetDef } from '@idlesuits/sim';
  import { formatMoney, type Decimal } from '../lib/money';
  import type { SideBetView } from '../lib/table.svelte';

  interface Props {
    defs: SideBetDef[];
    views: SideBetView[];
    stakes: Record<string, Decimal>;
    dealerClaims: boolean;
    ante: Decimal;
    /** Opens the bets panel, where stakes are set. */
    onEdit: () => void;
  }

  let { defs, views, stakes, dealerClaims, ante, onEdit }: Props = $props();

  /** "Flush Rush" → "FR", so a full name is never needed in the strip. */
  const initials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('');
</script>

<div class="strip">
  {#each defs as def (def.id)}
    {@const view = views.find((v) => v.def.id === def.id)}
    {@const stake = stakes[def.id]}
    {@const owner = view?.owner ?? (stake?.gt(0) ? 'player' : dealerClaims ? 'dealer' : 'none')}
    {@const hot = view && view.owner !== 'none' && view.net === null && view.progress >= view.target - 1}
    <button type="button" class="bet {owner}" class:hot onclick={onEdit} title={def.name}>
      <b>{initials(def.name)}</b>
      {#if view && view.owner !== 'none'}
        <span class="progress">{view.progress}/{view.target}</span>
        <span class="money">
          {#if view.net !== null}
            <span class:win={view.net > 0} class:loss={view.net < 0}>
              {view.net === 0 ? 'miss' : formatMoney(ante.mul(view.net), true)}
            </span>
          {:else}
            {formatMoney(ante.mul(view.stake))}
          {/if}
        </span>
      {:else}
        <span class="progress">{owner === 'dealer' ? "dealer's" : 'off'}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
    padding: 0 8px;
  }
  .bet {
    --own: var(--muted);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    min-height: 44px;
    border-radius: 999px;
    border: 1.5px solid color-mix(in srgb, var(--own) 55%, transparent);
    background: color-mix(in srgb, var(--own) 12%, var(--felt-deep));
    color: var(--ink);
    font: 500 13px/1 var(--font-ui);
  }
  .bet.player {
    --own: var(--player);
  }
  .bet.dealer {
    --own: var(--dealer);
  }
  .bet.hot {
    box-shadow: 0 0 0 1.5px var(--own), 0 0 14px var(--own);
  }
  b {
    font: 700 13px/1 var(--font-display);
    letter-spacing: 0.06em;
    color: var(--own);
  }
  .progress {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .money {
    font-variant-numeric: tabular-nums;
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
</style>
