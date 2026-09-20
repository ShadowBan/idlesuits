<script lang="ts">
  import type { Game } from '../lib/game.svelte';
  import { formatMoney } from '../lib/money';

  let { game }: { game: Game } = $props();

  const view = $derived(game.view);
  const choice = $derived(game.betChoice);
</script>

<div class="bar" class:deciding={game.awaiting === 'bet'}>
  {#if game.awaiting === 'bet' && choice}
    <div class="choice" role="group" aria-label="Fold or raise">
      {#each Array.from({ length: choice.cap + 1 }, (_, i) => i) as raise (raise)}
        <button
          type="button"
          class="act"
          class:fold={raise === 0}
          class:suggested={raise === choice.suggested}
          onclick={() => game.chooseRaise(raise)}
        >
          {#if raise === 0}
            Fold<kbd>F</kbd>
          {:else}
            Raise {raise}×<small>{formatMoney(game.roundAnte.mul(raise))}</small><kbd>{raise}</kbd>
          {/if}
        </button>
      {/each}
    </div>
    <p class="hint">Plan says {choice.suggested === 0 ? 'fold' : `${choice.suggested}×`}</p>
  {:else if game.awaiting === 'flip'}
    <button type="button" class="act" onclick={() => game.flipAll()}>Flip all</button>
    <p class="hint">Tap your cards to turn them over</p>
  {:else if game.awaiting === 'deal'}
    <button type="button" class="act primary" onclick={() => game.deal()}>Deal</button>
    {#if view.net !== null}
      <p class="hint" class:win={view.net > 0} class:loss={view.net < 0}>
        {formatMoney(game.roundAnte.mul(view.net), true)} this hand
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
    max-width: 520px;
  }
  .act {
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 12px 16px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .choice .act {
    flex: 1 1 0;
    justify-content: center;
  }
  .act.fold {
    color: var(--muted);
  }
  .act.suggested {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .act small {
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
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

  /* Keyboard hints are noise on touch devices. */
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
</style>
