<script lang="ts">
  import type { Move } from '@idlesuits/sim';
  import { formatMoney } from '../../lib/money';
  import type { BjGame } from './game.svelte';

  let { game }: { game: BjGame } = $props();

  const decision = $derived(game.decision);
  const view = $derived(game.view);

  const moves = $derived.by((): { move: Move; label: string; key: string; free?: boolean }[] => {
    if (!decision) return [];
    const free = game.freeDoubleReady();
    return [
      { move: 'hit', label: 'Hit', key: 'H' },
      { move: 'stand', label: 'Stand', key: 'S' },
      ...(decision.allowed.double
        ? [{ move: 'double' as const, label: free ? 'Free double' : 'Double', key: 'D', free }]
        : []),
      ...(decision.allowed.split ? [{ move: 'split' as const, label: 'Free split', key: 'P', free: true }] : []),
    ];
  });
</script>

<div class="bar">
  {#if game.awaiting === 'move' && decision}
    <div class="choice" role="group" aria-label="Your move">
      {#each moves as option (option.move)}
        <button
          type="button"
          class="act"
          class:free={option.free}
          class:suggested={option.move === decision.suggestion}
          onclick={() => game.choose(option.move)}
        >
          {option.label}<kbd>{option.key}</kbd>
        </button>
      {/each}
    </div>
    <p class="hint">
      {#if decision.regime === 'free'}
        House money: a loss costs you nothing
      {:else}
        Chart says {decision.suggestion}
      {/if}
    </p>
  {:else if game.awaiting === 'deal'}
    <button type="button" class="act primary" onclick={() => game.deal()}>Deal</button>
    {#if view.net !== null}
      <p class="hint" class:win={view.net > 0} class:loss={view.net < 0}>
        {formatMoney(game.roundBet.mul(view.net), true)} this hand
      </p>
    {/if}
  {:else if game.started && !game.gameOver}
    <p class="hint auto">Auto playing · {game.speed}</p>
    <button type="button" onclick={() => game.togglePause()}>{game.paused ? 'Resume' : 'Pause'}</button>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
    min-height: 58px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .choice {
    display: flex;
    gap: 8px;
    flex: 1 1 auto;
    justify-content: center;
    max-width: 560px;
  }
  .act {
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 12px 22px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .choice .act {
    flex: 1 1 0;
  }
  .act.free {
    border-color: var(--gold);
    color: var(--gold);
  }
  .act.suggested {
    box-shadow: 0 0 0 1px var(--gold);
  }
  .hint {
    margin: 0;
    font: 13px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .hint.win {
    color: var(--win);
  }
  .hint.loss {
    color: var(--loss);
  }
  kbd {
    font: 600 10px/1 var(--font-ui);
    padding: 2px 4px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--muted);
  }
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
</style>
