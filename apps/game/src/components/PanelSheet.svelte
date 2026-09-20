<script lang="ts">
  import type { Game } from '../lib/game.svelte';
  import BetPanel from './BetPanel.svelte';
  import StatsPanels from './StatsPanels.svelte';

  interface Props {
    game: Game;
    muted: boolean;
    onMuteChange: (muted: boolean) => void;
  }

  let { game, muted, onMuteChange }: Props = $props();

  let dialog: HTMLDialogElement;
  let tab = $state<'bets' | 'stats'>('bets');

  /** Opens the sheet, optionally on a particular tab. */
  export function open(which: 'bets' | 'stats' = 'bets') {
    tab = which;
    dialog.showModal();
  }
</script>

<dialog bind:this={dialog} class="sheet" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="body">
    <header>
      <div class="tabs" role="group" aria-label="Panel">
        <button type="button" aria-pressed={tab === 'bets'} onclick={() => (tab = 'bets')}>Bets</button>
        <button type="button" aria-pressed={tab === 'stats'} onclick={() => (tab = 'stats')}>Session</button>
      </div>
      <button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <div class="content">
      {#if tab === 'bets'}
        <BetPanel {game} />
      {:else}
        <StatsPanels {game} {muted} {onMuteChange} />
      {/if}
    </div>
  </div>
</dialog>

<style>
  .sheet {
    width: 100vw;
    max-width: 100vw;
    max-height: 88dvh;
    margin: auto auto 0;
    padding: 0;
    border: 0;
    border-radius: 16px 16px 0 0;
    background: var(--felt-deep);
    color: var(--ink);
  }
  .sheet::backdrop {
    background: rgb(0 0 0 / 0.6);
  }
  .body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    max-height: 88dvh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    background: var(--felt-deep);
  }
  .tabs {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .tabs button {
    border: 0;
    border-radius: 0;
    min-height: 40px;
  }
  .tabs button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .close {
    min-width: 44px;
    min-height: 44px;
  }
  .content {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
    display: grid;
    gap: 12px;
    align-content: start;
  }
</style>
