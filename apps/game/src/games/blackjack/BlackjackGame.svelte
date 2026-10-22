<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { BJ_BONUSES, type Move } from '@idlesuits/sim';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { setMuted, unlockAudio } from '../../lib/sound';
  import BjActionBar from './BjActionBar.svelte';
  import BjHandRow from './BjHandRow.svelte';
  import BjPanels from './BjPanels.svelte';
  import BjRules from './BjRules.svelte';
  import { BjGame, type SpeedMode } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new BjGame();
  const view = game.view;
  onDestroy(() => game.dispose());

  const compact = new MediaQuery('(max-width: 899px)');
  const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
  const FLIP_MS: Record<SpeedMode, number> = { smart: 260, '1x': 300, '2x': 190, '5x': 90 };

  let muted = $state(false);
  let rules = $state<BjRules>();
  let sheet = $state<HTMLDialogElement>();
  $effect(() => setMuted(muted));

  const flipMs = $derived(FLIP_MS[game.speed]);
  const sideSpots = $derived(
    BJ_BONUSES.filter((b) => (game.roundSide[b.id] ?? 0) > 0).map((b) => ({
      bet: b,
      units: game.roundSide[b.id]!,
      result: view.bonusResults[b.id],
    })),
  );
  const KEYS: Record<string, Move> = { h: 'hit', s: 'stand', d: 'double', p: 'split' };

  function begin() {
    unlockAudio();
    game.start();
  }

  function tapFelt(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, dialog')) return;
    if (game.awaiting === 'deal') game.deal();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const move = KEYS[e.key.toLowerCase()];
    if (move && game.awaiting === 'move') {
      const allowed = game.decision!.allowed;
      if (move === 'double' && !allowed.double) return;
      if (move === 'split' && !allowed.split) return;
      return game.choose(move);
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />

<BjRules bind:this={rules} rules={game.rules} />

{#if compact.current}
  <dialog bind:this={sheet} class="sheet" onclick={(e) => e.target === sheet && sheet.close()}>
    <div class="sheet-body">
      <header>
        <h2>Table</h2>
        <button type="button" onclick={() => sheet?.close()} aria-label="Close">✕</button>
      </header>
      <div class="sheet-content">
        <BjPanels {game} {muted} onMuteChange={(m) => (muted = m)} />
      </div>
    </div>
  </dialog>
{/if}

<div class="app" class:compact={compact.current}>
  <header class="bar">
    <h1>Free Bet <span>Blackjack</span></h1>

    <div class="stat bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(game.bank)}</span>
    </div>

    {#if !compact.current}
      <div class="speed" role="group" aria-label="Deal speed">
        {#each SPEEDS as s (s)}
          <button type="button" aria-pressed={game.speed === s} onclick={() => (game.speed = s)}>{s}</button>
        {/each}
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="auto" aria-pressed={game.autoPlay} onclick={() => game.setAutoPlay(!game.autoPlay)}>
        Auto {game.autoPlay ? 'on' : 'off'}
      </button>
      {#if compact.current}
        <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
        <button type="button" onclick={() => sheet?.showModal()} aria-label="Bet and session">⋯</button>
        <button type="button" onclick={() => rules?.open()} aria-label="How to play">?</button>
      {:else}
        <button type="button" onclick={() => (muted = !muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" onclick={() => rules?.open()}>How to play</button>
        <button type="button" onclick={onExit}>Leave table</button>
      {/if}
    </div>
  </header>

  <!-- Tapping the felt deals the next hand; every action also has a button. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="felt" onclick={tapFelt}>
    <BjHandRow
      title="Dealer"
      cards={view.dealer}
      total={view.dealerTotal}
      side="dealer"
      {flipMs}
      note={view.dealerTotal?.total === 22 ? 'Push 22' : view.peeked ? 'Blackjack' : undefined}
    />

    <div class="middle">
      {#if view.net !== null}
        <p class="banner" class:win={view.net > 0} class:loss={view.net < 0} class:big={view.net >= 2}>
          {view.net > 0 ? 'You win' : view.net < 0 ? 'Dealer wins' : 'Push'}
          <b>{formatMoney(game.roundBet.mul(view.net), true)}</b>
        </p>
      {:else if game.started}
        <p class="stake">Betting {formatMoney(game.roundBet)}</p>
      {/if}
      {#if game.started && sideSpots.length}
        <ul class="side-bets" aria-label="Side bets">
          {#each sideSpots as spot (spot.bet.id)}
            {@const net = spot.result?.net}
            <li class:win={(net ?? 0) > 0} class:loss={(net ?? 0) < 0}>
              {spot.bet.name}
              <b>{net === undefined ? formatMoney(game.roundBet.mul(spot.units)) : formatMoney(game.roundBet.mul(net), true)}</b>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="hands" class:many={view.hands.length > 2}>
      {#each view.hands as hand, i (i)}
        <BjHandRow
          title={view.hands.length > 1 ? `Hand ${i + 1}` : 'You'}
          cards={hand.cards}
          total={hand.total}
          side="player"
          {flipMs}
          {hand}
          bet={game.roundBet}
          active={view.active === i}
        />
      {/each}
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>The house pays for your doubles and splits. In exchange, a dealer 22 is a push.</p>
        <button type="button" class="primary" onclick={begin}>Take a seat</button>
        <button type="button" onclick={() => rules?.open()}>How to play</button>
      </div>
    {:else if game.gameOver}
      <div class="overlay">
        <h2>Busted</h2>
        <p>{game.hands} hands · biggest win {formatMoney(game.biggestWin)}</p>
        <button type="button" class="primary" onclick={() => game.restart()}>Buy back in</button>
      </div>
    {/if}
  </main>

  <div class="act"><BjActionBar {game} /></div>

  {#if !compact.current}
    <aside class="side"><BjPanels {game} {muted} onMuteChange={(m) => (muted = m)} /></aside>
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
    grid-template-rows: auto auto auto;
    align-content: center;
    gap: clamp(12px, 4dvh, 40px);
    padding: 16px 12px;
    border-radius: 24px;
    background: radial-gradient(ellipse at center, var(--felt) 0%, var(--felt-deep) 100%);
    box-shadow:
      inset 0 0 0 10px var(--rail),
      inset 0 0 60px rgb(0 0 0 / 0.5);
    overflow: hidden;
  }
  .compact .felt {
    gap: 4px;
    padding: 10px 6px;
    border-radius: 18px;
    box-shadow:
      inset 0 0 0 5px var(--rail),
      inset 0 0 40px rgb(0 0 0 / 0.5);
  }
  .middle {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 6px;
    min-height: 28px;
  }
  .side-bets {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  .side-bets li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px dashed color-mix(in srgb, var(--gold) 55%, transparent);
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .side-bets b {
    font: 700 13px/1 var(--font-display);
    letter-spacing: 0;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .side-bets li.win {
    border-style: solid;
    border-color: var(--win);
  }
  .side-bets li.win b {
    color: var(--win);
  }
  .side-bets li.loss b {
    color: var(--loss);
  }
  .hands {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    justify-content: center;
  }
  /* Four hands on a phone: shrink the cards rather than wrap off the table. */
  .hands.many {
    --card-w: clamp(26px, min(6dvh, 10vw), 54px);
  }
  .banner {
    margin: 0;
    font: 700 18px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    animation: pop 300ms ease-out;
  }
  .banner.big {
    font-size: 24px;
    color: var(--gold);
    text-shadow: 0 0 18px var(--gold);
  }
  .stake {
    margin: 0;
    font: 500 13px/1 var(--font-ui);
    color: var(--muted);
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 16px;
    text-align: center;
    background: rgb(5 20 15 / 0.82);
  }
  .overlay h2 {
    margin: 0;
    font: 700 36px/1 var(--font-display);
    color: var(--loss);
    text-transform: uppercase;
  }
  .overlay p {
    margin: 0;
    max-width: 34ch;
    color: var(--muted);
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
