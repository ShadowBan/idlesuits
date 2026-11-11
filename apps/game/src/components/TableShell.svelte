<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { bankroll } from '../lib/casino.svelte';
  import { floor } from '../lib/floor.svelte';
  import type { Decimal } from '../lib/money';
  import { formatLimit } from '../lib/rooms';
  import { route } from '../lib/route.svelte';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';
  import { autoplay } from '../lib/autoplay.svelte';
  import { autoFeed } from '../lib/autofeed.svelte';
  import { ui } from '../lib/ui.svelte';
  import BankCounter from './BankCounter.svelte';
  import TokenCounter from './charms/TokenCounter.svelte';

  interface Props {
    /** Shown as two words, the second in gold. */
    title: [string, string];
    bank: Decimal;
    autoPlay: boolean;
    onAuto: (on: boolean) => void;
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
    /** A slot machine: a cabinet in place of the felt and rail, and no chip tray. */
    machine?: boolean;
    /** The slot machine's id, so its cabinet can be dressed in its own style (see `games/slots/cabinets.css`). */
    cabinet?: string;
    /** The table's pace, for the quick controls on a phone. */
    seq?: SpeedControl;
    /**
     * A kept win being drawn again. The table is marked the same way at every
     * game while one is loaded: a cyan frame with viewfinder corners, and a
     * bar at the felt's foot saying what it is, its result once it has played
     * out, and Stop or Close.
     */
    replay?: { label: string; result?: string; won?: boolean; done: boolean; onClose?: () => void } | null;
  }

  let {
    title,
    bank,
    autoPlay,
    onAuto,
    onRules,
    onExit,
    onTapFelt,
    cards = { across: 5, rows: 3 },
    felt,
    action,
    panels,
    machine = false,
    cabinet,
    seq,
    replay = null,
  }: Props = $props();

  /**
   * Card width from the felt's own size (container units): wide enough to fill
   * a row, short enough that every row plus the betting spots fits.
   */
  const cardWidth = $derived(
    `clamp(30px, min(calc((100cqw - 28px) / ${cards.across * 1.16}), calc((100cqh - ${cards.rows * 32 + (cards.reserve ?? 230)}px) / ${cards.rows * 1.4})), 104px)`,
  );

  /** Moves down a room before the player sat down here aren't news at this table. */
  const movesAtSit = untrack(() => floor.moves);

  /** Below this the table fits one screen and the panels move into a sheet. */
  const compact = new MediaQuery('(max-width: 899px)');
  let sheet = $state<HTMLDialogElement>();

  // Auto play's shared rules follow this table's switch, and stop it when one of them says so.
  /** Why auto play stopped, shown a few seconds by the auto controls. */
  let stopped = $state<string | null>(null);
  let stoppedTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    autoplay.setActive(autoPlay);
    if (autoPlay) stopped = null;
  });
  $effect(() => () => {
    autoplay.setActive(false);
    clearTimeout(stoppedTimer);
  });
  let lastStop = untrack(() => autoplay.stops);
  $effect(() => {
    const stops = autoplay.stops;
    if (stops === lastStop) return;
    lastStop = stops;
    untrack(() => {
      if (autoPlay) toggleAuto(false);
      stopped = autoplay.reason;
    });
    clearTimeout(stoppedTimer);
    stoppedTimer = setTimeout(() => (stopped = null), 6000);
  });

  /** The player turns auto play on or off: off stops it on the engine's clock too (leaving the table doesn't). */
  function toggleAuto(on: boolean) {
    if (!on) autoFeed.stop();
    onAuto(on);
  }

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
        <button type="button" class="gear" onclick={() => (ui.settingsOpen = true)}>Settings</button>
        <button type="button" onclick={() => sheet?.close()} aria-label="Close">✕</button>
      </header>
      <div class="sheet-content">{@render panels()}</div>
    </div>
  </dialog>
{/if}

<!-- `data-game` picks the felt's colour: each game has its own, as a real casino's layouts do. -->
<div class="app" class:compact={compact.current} class:machine data-cabinet={cabinet} data-game={route.current}>
  <header class="bar">
    <h1>{title[0]} <span>{title[1]}</span></h1>

    <div class="bank">
      <BankCounter {bank} />
      {#if bankroll.practice}
        <span class="practice" title="This game isn’t played on the Players Club server yet: you play it on a practice bankroll that never touches your real bank, Tokens, charms or stats.">Practice</span>
      {/if}
    </div>
    <TokenCounter />

    <div class="actions">
      {#if compact.current}
        <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
        <button type="button" onclick={() => sheet?.showModal()} aria-label="Bets and session">⋯</button>
        <button type="button" onclick={onRules} aria-label="How to play">?</button>
      {:else}
        <button type="button" onclick={() => (ui.settingsOpen = true)}>Settings</button>
        <button type="button" onclick={onRules}>How to play</button>
        <button type="button" onclick={onExit}>Leave table</button>
      {/if}
    </div>
  </header>

  <!-- Tapping the felt is a shortcut; every action also has its own button. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="table" onclick={tap}>
    <div class="felt">
      {#if !machine}
        <div class="tray" aria-hidden="true">
          {#each ['#f2efe8', '#c42332', '#1e8a4f', '#1b1b21', '#6c3fa8', '#1b1b21', '#1e8a4f', '#c42332', '#f2efe8'] as color, i (i)}
            <span style:--c={color}></span>
          {/each}
        </div>
      {/if}
      {#if ui.admin}
        <!-- The pit boss's marker, left of the tray: only there once the pit boss is switched on. -->
        <button type="button" class="marker" onclick={() => (ui.adminOpen = !ui.adminOpen)} aria-label="Pit boss">PB</button>
      {/if}
      <!-- The table's limit sign, beside the tray; it flashes when a short bankroll moves the player down a room. -->
      {#key floor.moves}
        <div class="limits" class:moved={floor.moves > movesAtSit} title="{floor.room.name}: main bet {formatLimit(floor.room.min)} to {formatLimit(floor.room.max)}, side bets up to {formatLimit(floor.room.sideMax)}">
          <span class="room">{floor.room.name}</span>
          <b>{formatLimit(floor.room.min)}–{formatLimit(floor.room.max)}</b>
        </div>
      {/key}
      <!-- Inside the felt so its container units measure the felt; no box of its own. -->
      <div class="surface" style:--card-w={cardWidth}>{@render felt()}</div>
      {#if replay}
        <!-- A replay is loaded: the table is framed like a camera's viewfinder, and says so at its foot. -->
        <div class="replay-frame" class:done={replay.done} aria-hidden="true">
          <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
        </div>
        <div class="replay-bar" role="status">
          <span class="tag">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" /></svg>
            Replay
          </span>
          <span class="what">{replay.label}</span>
          {#if replay.result}<b class:won={replay.won}>{replay.result}</b>{/if}
          <small>nothing staked</small>
          {#if replay.onClose}<button type="button" onclick={replay.onClose}>{replay.done ? 'Close' : 'Stop'}</button>{/if}
        </div>
      {/if}
    </div>
  </main>

  <!-- Auto play and the pace sit right over the action, a thumb away; ⚙ opens the game's auto play settings. -->
  <div class="quick">
    <div class="auto-group">
      <button type="button" class="auto-switch" role="switch" aria-checked={autoPlay} onclick={() => toggleAuto(!autoPlay)}>
        <i aria-hidden="true"></i>
        Auto <b>{autoPlay ? 'On' : 'Off'}</b>
      </button>
      <button type="button" class="auto-gear" onclick={() => (ui.autoOpen = true)} aria-label="Auto play settings" title="Auto play settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.6 4.9-1.9-.4a7 7 0 0 1-.7 1.6l1.1 1.6-1.7 1.7-1.6-1.1a7 7 0 0 1-1.6.7l-.4 1.9h-2.4l-.4-1.9a7 7 0 0 1-1.6-.7l-1.6 1.1-1.7-1.7 1.1-1.6a7 7 0 0 1-.7-1.6l-1.9-.4v-2.4l1.9-.4a7 7 0 0 1 .7-1.6L5.6 6.2l1.7-1.7 1.6 1.1a7 7 0 0 1 1.6-.7l.4-1.9h2.4l.4 1.9a7 7 0 0 1 1.6.7l1.6-1.1 1.7 1.7-1.1 1.6a7 7 0 0 1 .7 1.6l1.9.4Z"
          /></svg
        >
        {#if !compact.current}<span>Settings</span>{/if}
      </button>
    </div>
    {#if autoplay.holding !== null}
      <span class="auto-note hold">Holding a {autoplay.holding >= 100 ? autoplay.holding.toFixed(0) : autoplay.holding.toFixed(1)}× win</span>
    {:else if stopped}
      <span class="auto-note">Auto play stopped: {stopped}</span>
    {:else if autoPlay && autoplay.rounds && !compact.current}
      <span class="auto-note quiet">{autoplay.rounds} {autoplay.rounds === 1 ? 'round' : 'rounds'} on auto</span>
    {/if}
    {#if seq}
      <div class="pace" role="group" aria-label="Deal speed">
        {#each SPEEDS as s (s)}
          <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s === 'smart' ? 'Smart' : s}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="act">{@render action()}</div>

  {#if !compact.current}
    <aside class="side">{@render panels()}</aside>
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'bar bar'
      'felt side'
      'quick side'
      'act side';
    gap: 12px;
    height: 100dvh;
    padding: 12px;
    overflow: hidden;
  }
  .app.compact {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'bar' 'felt' 'quick' 'act';
    gap: 6px;
    padding: 8px 8px 0;
  }
  /* Auto play's switch, its settings and the pace, just over the action. */
  .quick {
    grid-area: quick;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .app:not(.compact) .quick {
    justify-content: center;
    gap: 14px;
    margin-bottom: -6px;
  }
  .auto-group {
    display: inline-flex;
    gap: 4px;
  }
  .auto-gear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--rail);
    font: 600 13px/1 var(--font-ui);
    color: var(--ink);
  }
  .compact .auto-gear {
    padding: 4px 9px;
  }
  .auto-gear svg {
    width: 17px;
    height: 17px;
    fill: currentColor;
  }
  .auto-note {
    padding: 5px 10px;
    border-radius: 999px;
    background: rgb(255 180 166 / 0.14);
    font: 600 12px/1.2 var(--font-ui);
    color: #ffb4a6;
    animation: note-in 250ms ease;
  }
  .auto-note.hold {
    background: rgb(255 215 94 / 0.16);
    color: var(--gold);
  }
  .auto-note.quiet {
    background: none;
    color: var(--muted);
    font-weight: 500;
  }
  .compact .auto-note {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }
  @keyframes note-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }
  .auto-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 12px 4px 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--rail);
    font: 600 13px/1 var(--font-ui);
    color: var(--ink);
  }
  .auto-switch i {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
    transition: background 150ms ease;
  }
  .auto-switch i::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: translate 150ms ease;
  }
  .auto-switch[aria-checked='true'] {
    border-color: #6be08f;
  }
  .auto-switch[aria-checked='true'] i {
    background: #3fbf6b;
  }
  .auto-switch[aria-checked='true'] i::after {
    translate: 14px 0;
  }
  .auto-switch b {
    color: var(--muted);
  }
  .auto-switch[aria-checked='true'] b {
    color: #6be08f;
  }
  .pace {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--rail);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .pace button {
    min-height: 30px;
    padding: 4px 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .pace button[aria-pressed='true'] {
    background: var(--gold);
    color: #1a1206;
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
    min-width: 64px;
  }
  .bank {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .practice {
    padding: 3px 7px;
    border-radius: 999px;
    background: rgb(120 170 255 / 0.16);
    color: #a9c8ff;
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: help;
  }
  .compact :global(.tokens) {
    margin-right: auto;
  }
  .actions {
    display: flex;
    gap: 6px;
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
  /*
   * A card table, dressed: a padded leather rail with stitching, a wood trim
   * where it meets the felt, a pool of light over the middle and a pinstripe
   * arc printed across the layout. Slot cabinets dress themselves.
   */
  .app:not(.machine) .table {
    position: relative;
    padding: 14px;
    background:
      radial-gradient(120% 50% at 50% 0%, rgb(255 255 255 / 0.13), transparent 55%),
      radial-gradient(60% 40% at 50% 100%, rgb(255 255 255 / 0.05), transparent 70%),
      linear-gradient(#3d2115, #26130b 55%, #150a06);
    box-shadow:
      0 14px 34px rgb(0 0 0 / 0.6),
      inset 0 2px 1px rgb(255 255 255 / 0.16),
      inset 0 -3px 2px rgb(0 0 0 / 0.55),
      inset 0 0 0 1px rgb(0 0 0 / 0.6);
  }
  .app:not(.machine) .table::before {
    content: '';
    position: absolute;
    inset: 6px;
    border: 1.5px dashed rgb(255 220 170 / 0.2);
    border-radius: 23px 23px 50% 50% / 23px 23px 104px 104px;
    pointer-events: none;
  }
  .app:not(.machine) .felt {
    isolation: isolate;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"),
      radial-gradient(ellipse 65% 50% at 50% 40%, var(--felt-hi) 0%, var(--felt) 55%, var(--felt-deep) 100%);
    box-shadow:
      0 0 0 3px #8a5a2b,
      0 0 0 4px #2a1508,
      inset 0 0 0 2px rgb(0 0 0 / 0.35),
      inset 0 0 70px rgb(0 0 0 / 0.6);
  }
  /* The pinstripe arc across the layout, behind everything on the felt. */
  .app:not(.machine) .felt::after {
    content: '';
    position: absolute;
    z-index: -1;
    left: 6%;
    right: 6%;
    top: 46%;
    height: 150%;
    border: 2px solid rgb(236 216 160 / 0.14);
    border-radius: 50%;
    outline: 1px solid rgb(236 216 160 / 0.08);
    outline-offset: 6px;
    pointer-events: none;
  }
  .app.compact:not(.machine) .table {
    padding: 7px;
  }
  .app.compact:not(.machine) .table::before,
  .app.compact:not(.machine) .felt::after {
    display: none;
  }
  /* Each game's felt: green, blue, red, burgundy, purple or teal, as real layouts come. */
  .app {
    --felt-hi: #1b6a4f;
  }
  .app[data-game='uth'],
  .app[data-game='lir'] {
    --felt: #17456e;
    --felt-deep: #0a2240;
    --felt-hi: #22609a;
  }
  .app[data-game='tcp'],
  .app[data-game='paigow'] {
    --felt: #6e1a22;
    --felt-deep: #350a10;
    --felt-hi: #8e2834;
  }
  .app[data-game='baccarat'] {
    --felt: #5a1230;
    --felt-deep: #2a0715;
    --felt-hi: #781d42;
  }
  /* On a red felt the house deals its blue deck, and the dealer's name is lighter, so neither sinks into the cloth. */
  .app[data-game='tcp'],
  .app[data-game='paigow'],
  .app[data-game='baccarat'] {
    --card-back: #1f3f86;
    --dealer: #ffb4a6;
  }
  .app[data-game='c4p'],
  .app[data-game='djwild'] {
    --felt: #3e2468;
    --felt-deep: #1d1036;
    --felt-hi: #553388;
  }
  .app[data-game='suits'],
  .app[data-game='csp'] {
    --felt: #0f5458;
    --felt-deep: #06292c;
    --felt-hi: #167379;
  }
  .compact .table {
    padding: 6px;
    border-radius: 22px 22px 50% 50% / 22px 22px 60px 60px;
  }
  .surface {
    display: contents;
  }
  /* A slot cabinet: brushed dark metal with a gold bezel, the glass inside it. */
  .machine .table,
  .machine.compact .table {
    border-radius: 26px;
    background:
      linear-gradient(160deg, rgb(255 255 255 / 0.1), transparent 40%),
      linear-gradient(#2c2238, #17111f 60%, #0d0913);
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.55),
      inset 0 0 0 2px #b8913a,
      inset 0 0 0 5px #2c2238,
      inset 0 0 0 6px rgb(242 198 78 / 0.35);
  }
  /* The limit sign and the pit boss's marker move to the corners, clear of the jackpot marquee. */
  .machine .limits,
  .machine.compact .limits {
    left: auto;
    right: 10px;
  }
  .machine .marker {
    right: auto;
    left: 10px;
  }
  .machine .felt,
  .machine.compact .felt {
    padding: 26px 12px 14px;
    border-radius: 18px;
    background: radial-gradient(ellipse 90% 80% at 50% 40%, #2a1745 0%, #160d26 60%, #0b0712 100%);
    box-shadow:
      inset 0 0 0 2px rgb(0 0 0 / 0.5),
      inset 0 0 60px rgb(0 0 0 / 0.6);
  }
  .compact .felt {
    /* The bottom corners curve in: enough room that the outer cards of a low row clear them. */
    padding: 16px 6px 30px;
    border-radius: 16px 16px 50% 50% / 16px 16px 54px 54px;
  }
  /* The dealer's chip tray, along the top edge. */
  .tray {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
    padding: 4px 10px 6px;
    border-radius: 0 0 12px 12px;
    /* A wooden tray, its slots dark between the stacks. */
    background:
      linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55)) 10px 4px / calc(100% - 20px) 10px no-repeat,
      linear-gradient(#6b4220, #4a2b14 60%, #2b1709);
    box-shadow:
      0 3px 6px rgb(0 0 0 / 0.55),
      inset 0 -1px 0 rgb(255 255 255 / 0.12);
    pointer-events: none;
  }
  .tray span {
    width: 16px;
    height: 10px;
    border-radius: 3px;
    background:
      linear-gradient(rgb(255 255 255 / 0.28), transparent 45%, rgb(0 0 0 / 0.3)),
      repeating-linear-gradient(90deg, var(--c) 0 3px, rgb(0 0 0 / 0.35) 3px 4px);
    box-shadow:
      inset 0 -1px 0 rgb(0 0 0 / 0.4),
      0 1px 0 rgb(0 0 0 / 0.5);
  }
  .compact .tray span {
    width: 9px;
    height: 5px;
  }
  /* A pit boss's lammer: a small marker disc on the felt, mirroring the limit sign across the tray. */
  .marker {
    position: absolute;
    z-index: 2;
    top: 3px;
    right: calc(50% + 90px);
    width: 22px;
    height: 22px;
    min-width: 0;
    min-height: 0;
    padding: 0;
    display: grid;
    place-items: center;
    border: 2px dashed #fff3fb;
    border-radius: 50%;
    background: radial-gradient(circle, #ff7ad9 55%, #c2409c 56%);
    box-shadow:
      0 0 0 1px #8a2a6e,
      0 2px 3px rgb(0 0 0 / 0.5);
    color: #3a0d2c;
    font: 800 8px/1 var(--font-ui);
    letter-spacing: 0.02em;
  }
  .marker:hover:not(:disabled) {
    background: radial-gradient(circle, #ff9be4 55%, #c2409c 56%);
  }
  .compact .marker {
    top: 1px;
    right: calc(50% + 64px);
    width: 18px;
    height: 18px;
    font-size: 7px;
  }
  /* A small acrylic sign on the felt's top edge, right of the tray: inside the felt's padding, clear of the cards. */
  .limits {
    position: absolute;
    top: 3px;
    left: calc(50% + 90px);
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgb(10 6 4 / 0.55);
    border: 1px solid rgb(236 216 160 / 0.35);
    font: 600 9px/1.1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--print);
    white-space: nowrap;
    pointer-events: none;
  }
  .limits b {
    font: 700 11px/1.1 var(--font-display);
    letter-spacing: 0.04em;
    color: var(--gold);
  }
  .limits.moved {
    animation: moved 1600ms ease-out;
  }
  @keyframes moved {
    0%,
    40% {
      border-color: var(--gold);
      box-shadow: 0 0 10px rgb(242 198 78 / 0.7);
    }
  }
  .compact .limits {
    top: 1px;
    left: calc(50% + 64px);
    padding: 1px 5px;
  }
  .compact .limits .room {
    display: none;
  }
  .compact .limits b {
    font-size: 10px;
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
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  .sheet-body h2 {
    margin: 0 auto 0 0;
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
      grid-template-rows: auto auto minmax(0, 1fr);
      grid-template-areas:
        'bar bar'
        'felt quick'
        'felt act';
      padding-bottom: 8px;
    }
    .quick {
      flex-direction: column;
      align-items: stretch;
    }
    .compact .act {
      height: auto;
      border-radius: 14px;
    }
  }
  /* A replay loaded: the felt framed in cyan, viewfinder corners, and a bar at its foot. The same at every game. */
  .replay-frame {
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: inherit;
    pointer-events: none;
    box-shadow:
      inset 0 0 0 3px rgb(95 208 255 / 0.85),
      inset 0 0 60px rgb(95 208 255 / 0.22);
    animation: replay-in 300ms ease;
  }
  .replay-frame i {
    position: absolute;
    width: 34px;
    height: 34px;
    border: 4px solid #8fe3ff;
    filter: drop-shadow(0 0 6px rgb(95 208 255 / 0.9));
  }
  .replay-frame .tl {
    top: 14px;
    left: 14px;
    border-right: 0;
    border-bottom: 0;
    border-top-left-radius: 6px;
  }
  .replay-frame .tr {
    top: 14px;
    right: 14px;
    border-left: 0;
    border-bottom: 0;
    border-top-right-radius: 6px;
  }
  .replay-frame .bl {
    bottom: 14px;
    left: 14px;
    border-right: 0;
    border-top: 0;
    border-bottom-left-radius: 6px;
  }
  .replay-frame .br {
    bottom: 14px;
    right: 14px;
    border-left: 0;
    border-top: 0;
    border-bottom-right-radius: 6px;
  }
  /* While it plays, the corners breathe; once it holds, they stay still. */
  .replay-frame:not(.done) i {
    animation: viewfinder 1.2s ease-in-out infinite alternate;
  }
  @keyframes viewfinder {
    to {
      opacity: 0.4;
    }
  }
  @keyframes replay-in {
    from {
      opacity: 0;
    }
  }
  .replay-bar {
    position: absolute;
    left: 50%;
    bottom: 12px;
    translate: -50% 0;
    z-index: 7;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 110px);
    padding: 5px 6px 5px 6px;
    border-radius: 999px;
    background: rgb(4 20 34 / 0.94);
    box-shadow:
      inset 0 0 0 1.5px rgb(95 208 255 / 0.85),
      0 4px 18px rgb(0 0 0 / 0.5);
    font: 600 12px/1 var(--font-ui);
    color: #d6f3ff;
    white-space: nowrap;
  }
  .replay-bar .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px 5px 8px;
    border-radius: 999px;
    background: #5fd0ff;
    color: #032433;
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .replay-bar .tag svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }
  .replay-bar .what {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .replay-bar b {
    color: #bfd0ea;
  }
  .replay-bar b.won {
    color: #8cf0b8;
  }
  .replay-bar small {
    color: rgb(214 243 255 / 0.55);
    font-size: 11px;
  }
  .replay-bar button {
    min-height: 0;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 12px;
  }
  .compact .replay-bar {
    bottom: 8px;
    gap: 6px;
    max-width: calc(100% - 24px);
    font-size: 11px;
  }
  .compact .replay-bar small {
    display: none;
  }
  /* A table's felt curves away at its foot: the lower corners sit up where the felt still is. */
  .app:not(.machine) .replay-frame .bl,
  .app:not(.machine) .replay-frame .br {
    bottom: 64px;
  }
  .app:not(.machine) .replay-frame .bl {
    left: 22px;
  }
  .app:not(.machine) .replay-frame .br {
    right: 22px;
  }
  .compact .replay-frame i {
    width: 22px;
    height: 22px;
    border-width: 3px;
  }
</style>
