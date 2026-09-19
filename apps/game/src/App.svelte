<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SUIT_SYMBOL } from '@idlesuits/sim';
  import BetPanel from './components/BetPanel.svelte';
  import Breakdown from './components/Breakdown.svelte';
  import HandRow from './components/HandRow.svelte';
  import RulesDialog from './components/RulesDialog.svelte';
  import SideBetTile from './components/SideBetTile.svelte';
  import type { SpeedMode } from './lib/director';
  import { Game } from './lib/game.svelte';
  import { Decimal, formatMoney } from './lib/money';
  import { setMuted, unlockAudio } from './lib/sound';

  const game = new Game();
  const view = game.view;
  onDestroy(() => game.dispose());
  const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
  const FLIP_MS: Record<SpeedMode, number> = { smart: 280, '1x': 320, '2x': 200, '5x': 90 };

  let muted = $state(false);
  let rulesDialog: RulesDialog;
  $effect(() => setMuted(muted));

  const flipMs = $derived(game.speed === 'smart' && view.drama === 'tense' ? 520 : FLIP_MS[game.speed]);

  const OUTCOME_TEXT: Record<string, string> = {
    win: 'You win',
    lose: 'Dealer wins',
    push: 'Push',
    fold: 'Folded',
    dealerNoQualify: 'Dealer does not qualify',
  };

  function begin() {
    unlockAudio();
    game.start();
  }

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

<div class="app">
  <header class="bar">
    <h1>Idle <span>Suits</span></h1>

    <div class="stat bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(game.bank)}</span>
    </div>

    <div class="speed" role="group" aria-label="Reveal speed">
      {#each SPEEDS as s (s)}
        <button type="button" aria-pressed={game.speed === s} onclick={() => (game.speed = s)}>{s}</button>
      {/each}
    </div>

    <div class="actions">
      <button type="button" onclick={() => rulesDialog.open()}>How to play</button>
      <button type="button" class="auto" aria-pressed={game.autoPlay} onclick={() => game.setAutoPlay(!game.autoPlay)}>
        Auto {game.autoPlay ? 'on' : 'off'}
      </button>
      <button type="button" onclick={() => game.togglePause()} disabled={!game.started}>
        {game.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onclick={() => (muted = !muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
    </div>
  </header>

  <main class="felt" data-drama={view.drama}>
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

      <div class="main-bet">
        <span class="chip">Ante</span>
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

    <div class="prompt">
      {#if game.awaiting === 'bet' && game.betChoice}
        {@const choice = game.betChoice}
        <span class="hint">Your bet</span>
        <div class="bet-choice" role="group" aria-label="Fold or raise">
          {#each Array.from({ length: choice.cap + 1 }, (_, i) => i) as raise (raise)}
            <button
              type="button"
              class:suggested={raise === choice.suggested}
              onclick={() => game.chooseRaise(raise)}
            >
              {#if raise === 0}Fold <kbd>F</kbd>{:else}Raise {raise}× {formatMoney(game.roundAnte.mul(raise))} <kbd>{raise}</kbd>{/if}
            </button>
          {/each}
        </div>
        <span class="hint">Plan says {choice.suggested === 0 ? 'fold' : `${choice.suggested}×`} <kbd>Space</kbd></span>
      {:else if game.awaiting === 'flip'}
        <span class="hint">Click your cards to turn them over <kbd>Space</kbd></span>
        <button type="button" onclick={() => game.flipAll()}>Flip all</button>
      {:else if game.awaiting === 'deal'}
        <button type="button" class="primary" onclick={() => game.deal()}>Deal</button>
        <span class="hint"><kbd>Space</kbd></span>
      {/if}
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>Build the biggest flush you can, then see if it beats the dealer's.</p>
        <button type="button" class="primary" onclick={begin}>Take a seat</button>
        <button type="button" onclick={() => rulesDialog.open()}>How to play</button>
      </div>
    {:else if game.gameOver}
      <div class="overlay">
        <h2>Busted</h2>
        <p>{game.hands} hands · biggest win {formatMoney(game.biggestWin)}</p>
        <button type="button" class="primary" onclick={() => game.restart()}>Buy back in</button>
      </div>
    {/if}
  </main>

  <aside class="side">
    <BetPanel {game} />

    <section>
      <h2>Last hand</h2>
      <Breakdown lines={view.last?.lines ?? []} net={view.last?.net ?? null} ante={game.lastAnte} />
    </section>

    <section>
      <h2>Session</h2>
      <dl>
        <dt>Hands</dt>
        <dd>{game.hands}</dd>
        <dt>Net</dt>
        <dd class:win={game.sessionNet.gt(0)} class:loss={game.sessionNet.lt(0)}>{formatMoney(game.sessionNet, true)}</dd>
        <dt>Biggest win</dt>
        <dd>{formatMoney(game.biggestWin)}</dd>
        {#each Object.entries(game.flushCounts).filter(([size]) => Number(size) >= 5) as [size, count] (size)}
          <dt>{size}-card flushes</dt>
          <dd>{count}</dd>
        {/each}
      </dl>
    </section>

    <section>
      <h2>Recent</h2>
      <ol class="history">
        {#each game.history as h (h.round)}
          <li>
            <span class="muted">#{h.round}</span>
            <span>{h.size}{SUIT_SYMBOL[h.suit]}</span>
            <span class="muted">{h.outcome === 'dealerNoQualify' ? 'no qual' : h.outcome}</span>
            <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{formatMoney(h.net, true)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <section>
      <h2>Dev</h2>
      <label class="toggle">
        <input type="checkbox" bind:checked={game.dealerClaims} />
        Dealer claims open side bets
      </label>
      <p class="muted small">Seed {game.runSeed} · hand {game.round}</p>
      <button type="button" onclick={() => game.restart()}>Restart</button>
    </section>
  </aside>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'bar bar'
      'felt side';
    gap: 12px;
    min-height: 100dvh;
    padding: 12px;
    box-sizing: border-box;
  }
  .bar {
    grid-area: bar;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 8px 14px;
    background: var(--rail);
    border-radius: 12px;
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
  .stat {
    display: grid;
    gap: 2px;
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

  .felt {
    grid-area: felt;
    position: relative;
    display: grid;
    align-content: space-evenly;
    gap: 16px;
    padding: 20px 12px;
    border-radius: 24px;
    background: radial-gradient(ellipse at center, var(--felt) 0%, var(--felt-deep) 100%);
    box-shadow: inset 0 0 0 10px var(--rail), inset 0 0 60px rgb(0 0 0 / 0.5);
    overflow: hidden;
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
    gap: 12px;
    justify-items: center;
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
    min-height: 40px;
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
  .prompt {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 50px;
  }
  .bet-choice {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .bet-choice button {
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 10px 14px;
  }
  .bet-choice button.suggested {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .hint {
    color: var(--muted);
    font-size: 13px;
  }
  kbd {
    font: 600 11px/1 var(--font-ui);
    padding: 3px 6px;
    margin-left: 4px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
  }
  .auto[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold);
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

  .side {
    grid-area: side;
    display: grid;
    align-content: start;
    gap: 12px;
  }
  .side section {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
  }
  .side h2 {
    margin: 0 0 8px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
    font: 13px/1.4 var(--font-ui);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    font: 13px/1.4 var(--font-ui);
  }
  .history li {
    display: grid;
    grid-template-columns: 44px 32px 1fr auto;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .toggle {
    display: flex;
    gap: 8px;
    align-items: center;
    font: 13px/1.4 var(--font-ui);
    margin-bottom: 8px;
  }
  .small {
    font-size: 12px;
    margin: 0 0 8px;
  }
  .muted {
    color: var(--muted);
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }

  @media (max-width: 900px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'bar' 'felt' 'side';
      padding: 8px;
    }
    h1 {
      flex-basis: 100%;
    }
  }
</style>
