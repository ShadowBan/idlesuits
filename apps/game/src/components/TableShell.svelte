<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import type { Decimal } from '../lib/money';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';
  import BankCounter from './BankCounter.svelte';

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
    /**
     * How many cards the widest row holds, how many rows of cards the table has,
     * and how much height (px) the rest of the layout needs (bet spots, labels),
     * so cards can be as large as the felt allows without crowding anything.
     */
    cards?: { across: number; rows: number; reserve?: number };
    felt: Snippet;
    action: Snippet;
    panels: Snippet;
  }

  let {
    title,
    bank,
    seq,
    autoPlay,
    onAuto,
    muted,
    onMute,
    onRules,
    onExit,
    onTapFelt,
    cards = { across: 5, rows: 3 },
    felt,
    action,
    panels,
  }: Props = $props();

  /**
   * Card width from the felt's own size (container units): wide enough to fill
   * a row, short enough that every row plus the betting spots fits.
   */
  const cardWidth = $derived(
    `clamp(30px, min(calc((100cqw - 28px) / ${cards.across * 1.16}), calc((100cqh - ${cards.rows * 32 + (cards.reserve ?? 230)}px) / ${cards.rows * 1.4})), 104px)`,
  );

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

    <div class="bank"><BankCounter {bank} /></div>

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
  <main class="table" onclick={tap}>
    <div class="felt">
      <div class="tray" aria-hidden="true">
        {#each ['#f2efe8', '#c42332', '#1e8a4f', '#1b1b21', '#6c3fa8', '#1b1b21', '#1e8a4f', '#c42332', '#f2efe8'] as color, i (i)}
          <span style:--c={color}></span>
        {/each}
      </div>
      <!-- Inside the felt so its container units measure the felt; no box of its own. -->
      <div class="surface" style:--card-w={cardWidth}>{@render felt()}</div>
    </div>
  </main>

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
  /* Wide enough for a growing balance: a new digit never nudges the buttons. */
  .bank {
    min-width: 96px;
  }
  .compact .bank {
    margin-right: auto;
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
  /* The table: a padded leather rail around the felt, curved along the players' side. */
  .table {
    grid-area: felt;
    min-height: 0;
    padding: 10px;
    border-radius: 28px 28px 50% 50% / 28px 28px 110px 110px;
    background:
      radial-gradient(120% 60% at 50% 0%, rgb(255 255 255 / 0.08), transparent 60%),
      linear-gradient(#3b2416, #23150d 60%, #170d08);
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.55),
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      inset 0 -2px 0 rgb(0 0 0 / 0.5);
  }
  .felt {
    --print: rgb(236 216 160 / 0.5);
    position: relative;
    height: 100%;
    container-type: size;
    display: grid;
    /* One row the felt's full height, so a table's layout can share it out. */
    grid-template-rows: minmax(0, 1fr);
    padding: 22px 12px 26px;
    border-radius: 20px 20px 50% 50% / 20px 20px 100px 100px;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"),
      radial-gradient(ellipse 80% 70% at 50% 45%, #1b6a4f 0%, var(--felt) 45%, var(--felt-deep) 100%);
    box-shadow:
      inset 0 0 0 2px rgb(0 0 0 / 0.35),
      inset 0 0 50px rgb(0 0 0 / 0.55);
    overflow: hidden;
  }
  .compact .table {
    padding: 6px;
    border-radius: 22px 22px 50% 50% / 22px 22px 60px 60px;
  }
  .surface {
    display: contents;
  }
  .compact .felt {
    padding: 16px 6px 18px;
    border-radius: 16px 16px 50% 50% / 16px 16px 54px 54px;
  }
  /* The dealer's chip tray, along the top edge. */
  .tray {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 3px 8px 4px;
    border-radius: 0 0 10px 10px;
    background: linear-gradient(#120b07, #26170e);
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.5);
    pointer-events: none;
  }
  .tray span {
    width: 14px;
    height: 7px;
    border-radius: 2px;
    background: repeating-linear-gradient(90deg, var(--c) 0 3px, rgb(0 0 0 / 0.35) 3px 4px);
    box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.4);
  }
  .compact .tray span {
    width: 9px;
    height: 5px;
  }
  /*
   * A fixed height, tall enough for the chip rack: switching between betting
   * and deciding swaps what is in the bar, never the size of the felt above it.
   */
  .act {
    grid-area: act;
    display: grid;
    align-content: center;
    height: 92px;
  }
  .compact .act {
    height: calc(132px + env(safe-area-inset-bottom));
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
      height: auto;
      border-radius: 14px;
    }
  }
</style>
