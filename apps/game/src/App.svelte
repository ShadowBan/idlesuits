<script lang="ts">
  import { SUIT_SYMBOL } from '@idlesuits/sim';
  import Breakdown from './components/Breakdown.svelte';
  import HandRow from './components/HandRow.svelte';
  import SideBetTile from './components/SideBetTile.svelte';
  import type { SpeedMode } from './lib/director';
  import { Game } from './lib/game.svelte';
  import { formatMoney } from './lib/money';
  import { setMuted, unlockAudio } from './lib/sound';

  const game = new Game();
  const view = game.view;
  const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
  const FLIP_MS: Record<SpeedMode, number> = { smart: 280, '1x': 320, '2x': 200, '5x': 90 };

  let muted = $state(false);
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
</script>

<div class="app">
  <header class="bar">
    <h1>Idle <span>Suits</span></h1>

    <div class="stat bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(game.bank)}</span>
    </div>

    <div class="stat">
      <span class="k">Ante</span>
      <span class="ante">
        <button type="button" onclick={() => game.changeAnte(0.5)} aria-label="Halve ante">−</button>
        <span class="v">{formatMoney(game.ante)}</span>
        <button type="button" onclick={() => game.changeAnte(2)} aria-label="Double ante">+</button>
      </span>
    </div>

    <div class="speed" role="group" aria-label="Reveal speed">
      {#each SPEEDS as s (s)}
        <button type="button" aria-pressed={game.speed === s} onclick={() => (game.speed = s)}>{s}</button>
      {/each}
    </div>

    <div class="actions">
      <button type="button" onclick={() => game.togglePause()} disabled={!game.started}>
        {game.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onclick={() => (muted = !muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
    </div>
  </header>

  <main class="felt" data-drama={view.drama}>
    <HandRow title="Dealer" hand={view.dealer} side="dealer" {flipMs}>
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
            claimed={game.claims[def.id] ?? false}
            dealerClaims={game.dealerClaims}
            ante={game.roundAnte}
            onToggle={() => (game.claims[def.id] = !game.claims[def.id])}
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
    </div>

    <HandRow title="You" hand={view.player} side="player" {flipMs} />

    {#if !game.started}
      <div class="overlay">
        <p>A standard deck, one dealer, and the house rules of I Luv Suits.</p>
        <button type="button" class="primary" onclick={begin}>Take a seat</button>
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
  .ante {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ante button {
    width: 24px;
    height: 24px;
    padding: 0;
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
