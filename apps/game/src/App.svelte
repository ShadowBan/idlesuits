<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import ActionBar from './components/ActionBar.svelte';
  import BetPanel from './components/BetPanel.svelte';
  import HandRow from './components/HandRow.svelte';
  import PanelSheet from './components/PanelSheet.svelte';
  import RulesDialog from './components/RulesDialog.svelte';
  import SideBetStrip from './components/SideBetStrip.svelte';
  import SideBetTile from './components/SideBetTile.svelte';
  import StatsPanels from './components/StatsPanels.svelte';
  import type { SpeedMode } from './lib/director';
  import { Game } from './lib/game.svelte';
  import { Decimal, formatMoney } from './lib/money';
  import { setMuted, unlockAudio } from './lib/sound';

  const game = new Game();
  const view = game.view;
  onDestroy(() => game.dispose());

  /** Below this the table is laid out to fit one screen, with panels in a sheet. */
  const compact = new MediaQuery('(max-width: 899px)');
  const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
  const FLIP_MS: Record<SpeedMode, number> = { smart: 280, '1x': 320, '2x': 200, '5x': 90 };

  let muted = $state(false);
  let rulesDialog = $state<RulesDialog>();
  let sheet = $state<PanelSheet>();
  $effect(() => setMuted(muted));

  const flipMs = $derived(game.speed === 'smart' && view.drama === 'tense' ? 520 : FLIP_MS[game.speed]);

  const OUTCOME_TEXT: Record<string, string> = {
    win: 'You win',
    lose: 'Dealer wins',
    push: 'Push',
    fold: 'Folded',
    dealerNoQualify: 'Dealer does not qualify',
  };

  // Re-estimate whenever a bet changes; debounced so clicking through steps stays cheap.
  $effect(() => {
    const key = JSON.stringify([
      game.ante.toString(),
      Object.entries(game.sideStakes).map(([id, s]) => [id, s.toString()]),
      game.raisePlan,
      game.dealerClaims,
    ]);
    const timer = setTimeout(() => key && game.refreshEstimate(), 250);
    return () => clearTimeout(timer);
  });

  function begin() {
    unlockAudio();
    game.start();
  }

  /** Tapping the felt flips the next card or deals: a big target for thumbs. */
  function tapFelt(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, dialog')) return;
    if (game.awaiting === 'flip' || game.awaiting === 'deal') game.advance();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    if (game.awaiting === 'bet') {
      const key = e.key.toLowerCase();
      if (key === 'f' || key === '0') return game.chooseRaise(0);
      if (/^[1-9]$/.test(key)) return game.chooseRaise(Number(key));
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />

<RulesDialog bind:this={rulesDialog} rules={game.rules} />
{#if compact.current}
  <PanelSheet bind:this={sheet} {game} {muted} onMuteChange={(m) => (muted = m)} />
{/if}

<div class="app" class:compact={compact.current}>
  <header class="bar">
    <h1>Idle <span>Suits</span></h1>

    <div class="stat bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(game.bank)}</span>
    </div>

    {#if !compact.current}
      <div class="speed" role="group" aria-label="Reveal speed">
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
        <button type="button" onclick={() => sheet?.open('bets')}>Bets</button>
        <button type="button" onclick={() => sheet?.open('stats')} aria-label="Session and table settings">⋯</button>
        <button type="button" onclick={() => rulesDialog?.open()} aria-label="How to play">?</button>
      {:else}
        <button type="button" onclick={() => (muted = !muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" onclick={() => rulesDialog?.open()}>How to play</button>
      {/if}
    </div>
  </header>

  <!-- Tapping the felt is a shortcut for Space; every action also has its own button. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="felt" data-drama={view.drama} onclick={tapFelt}>
    <HandRow
      title="Dealer"
      hand={view.dealer}
      side="dealer"
      {flipMs}
      winner={view.net !== null && view.outcome === 'lose'}
      decider={view.outcome === 'lose' ? view.decider : null}
    >
      {#snippet badge()}
        {#if view.qualified !== null}
          <span class="badge" class:bad={!view.qualified}>{view.qualified ? 'Qualified' : 'Not qualified'}</span>
        {/if}
      {/snippet}
    </HandRow>

    <div class="middle">
      {#if compact.current}
        <SideBetStrip
          defs={game.rules.sideBets}
          views={view.sideBets}
          stakes={game.sideStakes}
          dealerClaims={game.dealerClaims}
          ante={game.roundAnte}
          onEdit={() => sheet?.open('bets')}
        />
      {:else}
        <div class="bets">
          {#each game.rules.sideBets as def (def.id)}
            <SideBetTile
              {def}
              view={view.sideBets.find((b) => b.def.id === def.id)}
              nextStake={game.sideStakes[def.id] ?? new Decimal(0)}
              dealerClaims={game.dealerClaims}
              ante={game.roundAnte}
            />
          {/each}
        </div>
      {/if}

      <div class="main-bet">
        <span class="chip">Ante {formatMoney(game.roundAnte)}</span>
        {#if view.raise === 0}
          <span class="chip fold">Fold</span>
        {:else if view.raise !== null}
          <span class="chip raise">Raise {view.raise}×</span>
        {/if}
        {#if view.net !== null && view.outcome}
          <p class="banner" class:win={view.net > 0} class:loss={view.net < 0} class:big={view.net >= 10}>
            {OUTCOME_TEXT[view.outcome]}
            <b>{formatMoney(game.roundAnte.mul(view.net), true)}</b>
          </p>
        {/if}
      </div>

      <div class="verdict">
        {#if view.net !== null && view.verdict}<p>{view.verdict}</p>{/if}
      </div>
    </div>

    <HandRow
      title="You"
      hand={view.player}
      side="player"
      {flipMs}
      winner={view.net !== null && (view.outcome === 'win' || view.outcome === 'dealerNoQualify')}
      decider={view.outcome === 'win' ? view.decider : null}
      onFlip={game.awaiting === 'flip' ? (slot) => game.flip(slot) : undefined}
    />

    {#if !game.started}
      <div class="overlay">
        <p>Build the biggest flush you can, then see if it beats the dealer's.</p>
        <button type="button" class="primary" onclick={begin}>Take a seat</button>
        <button type="button" onclick={() => rulesDialog?.open()}>How to play</button>
      </div>
    {:else if game.gameOver}
      <div class="overlay">
        <h2>Busted</h2>
        <p>{game.hands} hands · biggest win {formatMoney(game.biggestWin)}</p>
        <button type="button" class="primary" onclick={() => game.restart()}>Buy back in</button>
      </div>
    {/if}
  </main>

  <div class="act"><ActionBar {game} /></div>

  {#if !compact.current}
    <aside class="side">
      <BetPanel {game} />
      <StatsPanels {game} {muted} onMuteChange={(m) => (muted = m)} />
    </aside>
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
  /* Phones: the table fills exactly one screen, panels live in a sheet. */
  .app.compact {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'bar' 'felt' 'act';
    height: 100dvh;
    min-height: 0;
    gap: 8px;
    padding: 8px 8px 0;
    overflow: hidden;
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
    font: 700 22px/1 var(--font-display);
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
    font: 700 18px/1.1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .bank .v {
    color: var(--gold);
    font-size: 22px;
  }
  .compact .bank .v {
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
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: space-evenly;
    gap: 12px;
    padding: 18px 12px;
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
  .felt::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 30%, rgb(0 0 0 / 0.6) 100%);
    opacity: 0;
    transition: opacity 300ms;
  }
  .felt[data-drama='tense']::after {
    opacity: 1;
  }
  .middle {
    display: grid;
    gap: 10px;
    align-content: center;
    justify-items: center;
  }
  .compact .middle {
    gap: 6px;
  }
  .bets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 240px));
    gap: 10px;
    justify-content: center;
    width: 100%;
  }
  .main-bet {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .chip {
    padding: 6px 12px;
    border-radius: 999px;
    border: 2px dashed var(--line);
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .chip.raise {
    border-color: var(--gold);
    color: var(--gold);
  }
  .chip.fold {
    color: var(--muted);
  }
  .banner {
    margin: 0 0 0 8px;
    font: 700 18px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    animation: pop 300ms ease-out;
  }
  .banner.big {
    font-size: 26px;
    color: var(--gold);
    text-shadow: 0 0 18px var(--gold);
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  .verdict {
    min-height: 20px;
    text-align: center;
  }
  .verdict p {
    margin: 0;
    font: 500 14px/1.4 var(--font-ui);
    color: var(--ink);
    animation: pop 300ms ease-out;
  }
  .compact .verdict p {
    font-size: 13px;
  }
  .badge {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--chip-bg);
  }
  .badge.bad {
    color: var(--win);
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

  /* Landscape phones: height is scarce, so the action bar moves beside the table. */
  @media (max-height: 520px) and (orientation: landscape) {
    /* The result banner already names the winner; the explanation needs room we don't have. */
    .verdict {
      display: none;
    }
    .compact .middle {
      gap: 10px;
    }
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
