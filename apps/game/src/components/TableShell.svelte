<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { formatMoney, type Decimal } from '../lib/money';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';

  interface Props {
    /** Shown as two words, the second in gold. */
    title: [string, string];
    bank: Decimal;
    seq: SpeedControl;
    autoPlay: boolean;
    onAuto: (on: boolean) => void;
    muted: boolean;
    onMute: (muted: boolean) => void;
    onRules: () => void;
    onExit: () => void;
    /** Tapping empty felt: deal, or whatever "next" means for this game. */
    onTapFelt?: () => void;
    felt: Snippet;
    action: Snippet;
    panels: Snippet;
  }

  let { title, bank, seq, autoPlay, onAuto, muted, onMute, onRules, onExit, onTapFelt, felt, action, panels }: Props =
    $props();

  /** Below this the table fits one screen and the panels move into a sheet. */
  const compact = new MediaQuery('(max-width: 899px)');
  let sheet = $state<HTMLDialogElement>();

  function tap(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, dialog')) return;
    onTapFelt?.();
  }
</script>

{#if compact.current}
  <dialog bind:this={sheet} class="sheet" onclick={(e) => e.target === sheet && sheet.close()}>
    <div class="sheet-body">
      <header>
        <h2>Table</h2>
        <button type="button" onclick={() => sheet?.close()} aria-label="Close">✕</button>
      </header>
      <div class="sheet-content">{@render panels()}</div>
    </div>
  </dialog>
{/if}

<div class="app" class:compact={compact.current}>
  <header class="bar">
    <h1>{title[0]} <span>{title[1]}</span></h1>

    <div class="stat bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(bank)}</span>
    </div>

    {#if !compact.current}
      <div class="speed" role="group" aria-label="Deal speed">
        {#each SPEEDS as s (s)}
          <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s}</button>
        {/each}
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="auto" aria-pressed={autoPlay} onclick={() => onAuto(!autoPlay)}>
        Auto {autoPlay ? 'on' : 'off'}
      </button>
      {#if compact.current}
        <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
        <button type="button" onclick={() => sheet?.showModal()} aria-label="Bets and session">⋯</button>
        <button type="button" onclick={onRules} aria-label="How to play">?</button>
      {:else}
        <button type="button" onclick={() => onMute(!muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" onclick={onRules}>How to play</button>
        <button type="button" onclick={onExit}>Leave table</button>
      {/if}
    </div>
  </header>

  <!-- Tapping the felt is a shortcut; every action also has its own button. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="felt" onclick={tap}>{@render felt()}</main>

  <div class="act">{@render action()}</div>

  {#if !compact.current}
    <aside class="side">{@render panels()}</aside>
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'bar bar'
      'felt side'
      'act side';
    gap: 12px;
    height: 100dvh;
    padding: 12px;
    overflow: hidden;
  }
  .app.compact {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'bar' 'felt' 'act';
    gap: 8px;
    padding: 8px 8px 0;
  }
  .bar {
    grid-area: bar;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    padding: 8px 14px;
    background: var(--rail);
    border-radius: 12px;
  }
  .compact .bar {
    flex-wrap: nowrap;
    gap: 8px;
    padding: 6px 10px;
  }
  h1 {
    margin: 0 auto 0 0;
    font: 700 20px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1 span {
    color: var(--gold);
  }
  .compact h1 {
    display: none;
  }
  .stat {
    display: grid;
    gap: 2px;
  }
  .compact .bank {
    margin-right: auto;
  }
  .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .v {
    font: 700 22px/1.1 var(--font-display);
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .compact .v {
    font-size: 18px;
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
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
  .actions {
    display: flex;
    gap: 6px;
  }
  .auto[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold);
  }
  .felt {
    grid-area: felt;
    position: relative;
    display: grid;
    align-content: center;
    gap: clamp(10px, 3dvh, 32px);
    padding: 16px 12px;
    border-radius: 24px;
    background: radial-gradient(ellipse at center, var(--felt) 0%, var(--felt-deep) 100%);
    box-shadow:
      inset 0 0 0 10px var(--rail),
      inset 0 0 60px rgb(0 0 0 / 0.5);
    overflow: hidden;
  }
  .compact .felt {
    gap: clamp(6px, 2dvh, 20px);
    padding: 10px 6px;
    border-radius: 18px;
    box-shadow:
      inset 0 0 0 5px var(--rail),
      inset 0 0 40px rgb(0 0 0 / 0.5);
  }
  .act {
    grid-area: act;
  }
  .compact .act {
    background: var(--rail);
    border-radius: 14px 14px 0 0;
  }
  .side {
    grid-area: side;
    display: grid;
    align-content: start;
    gap: 12px;
    overflow-y: auto;
  }
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
  .sheet-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    max-height: 88dvh;
  }
  .sheet-body header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  .sheet-body h2 {
    margin: 0;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .sheet-content {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
    display: grid;
    gap: 12px;
    align-content: start;
  }
  @media (max-height: 520px) and (orientation: landscape) {
    .app.compact {
      grid-template-columns: minmax(0, 1fr) 190px;
      grid-template-areas:
        'bar bar'
        'felt act';
      padding-bottom: 8px;
    }
    .compact .act {
      display: grid;
      align-content: center;
      border-radius: 14px;
    }
  }
</style>
