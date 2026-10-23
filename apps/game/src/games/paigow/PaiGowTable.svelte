<script lang="ts">
  import { onDestroy } from 'svelte';
  import { PG_BONUSES, pgHandName, pgLowName as lowName, type HandWinner } from '@idlesuits/sim';
  import Breakdown from '../../components/Breakdown.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { SPEEDS } from '../../lib/sequencer.svelte';
  import { setMuted, unlockAudio } from '../../lib/sound';
  import { PaiGowGame } from './game.svelte';
  import PaiGowRules from './PaiGowRules.svelte';
  import SplitHand from './SplitHand.svelte';

  let { onExit }: GameProps = $props();

  const game = new PaiGowGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<PaiGowRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 260, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const setting = $derived(seq.awaiting === 'move');
  const preview = $derived(game.preview);

  const result = (w: HandWinner | undefined, mine: boolean) =>
    w === undefined ? undefined : (w === 'player') === mine ? 'won' : 'lost';

  const sideSpots = $derived(
    PG_BONUSES.filter((b) => (game.roundSide[b.id] ?? 0) > 0).map((b) => ({
      bet: b,
      units: game.roundSide[b.id]!,
      result: game.bonusResults[b.id],
    })),
  );

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    if (setting && e.key.toLowerCase() === 'h') return game.showHouseWay();
    if (setting && /^[1-7]$/.test(e.key)) return game.toggle(Number(e.key) - 1);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<PaiGowRules bind:this={rules} />

<TableShell
  title={['Pai Gow', 'Poker']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
>
  {#snippet felt()}
    <div class="layout">
      <SplitHand
        title="Dealer"
        side="dealer"
        cards={game.dealer}
        set={game.dealerSet?.set ?? null}
        lowName={game.dealerSet ? lowName(game.dealerSet.hands.lowScore) : undefined}
        highName={game.dealerSet ? pgHandName(game.dealerSet.hands.highScore) : undefined}
        lowResult={result(game.winners.low, false)}
        highResult={result(game.winners.high, false)}
        {flipMs}
      />

      <div class="middle">
        <ul class="bets" aria-label="Your bets">
          <li
            class="placed"
            class:win={game.outcome === 'win'}
            class:loss={game.outcome === 'lose'}
          >
            <span class="name">Bet</span>
            <b>{formatMoney(game.roundBet)}</b>
            {#if game.outcome}
              <small class="result-net">
                {game.outcome === 'push' ? 'push' : formatMoney(game.roundBet.mul(game.outcome === 'win' ? 0.95 : -1), true)}
              </small>
            {/if}
          </li>
          {#if game.started}
            {#each sideSpots as spot (spot.bet.id)}
              {@const net = spot.result?.net}
              <li class="placed side" class:win={(net ?? 0) > 0} class:loss={(net ?? 0) < 0}>
                <span class="name">{spot.bet.short}</span>
                <b>{formatMoney(game.roundBet.mul(spot.units))}</b>
                {#if net !== undefined}<small class="result-net">{formatMoney(game.roundBet.mul(net), true)}</small>{/if}
              </li>
            {/each}
          {/if}
        </ul>

        <div class="result">
          {#if game.net !== null}
            <p class="banner" class:win={game.net > 0} class:loss={game.net < 0} class:big={game.net >= 5}>
              {game.outcome === 'win' ? 'You win both' : game.outcome === 'push' ? 'Push' : 'Dealer wins'}
              <b>{formatMoney(game.roundBet.mul(game.net), true)}</b>
            </p>
          {/if}
        </div>
      </div>

      <SplitHand
        title="You"
        side="player"
        cards={game.player}
        set={game.playerSet?.set ?? null}
        lowName={game.playerSet ? lowName(game.playerSet.hands.lowScore) : undefined}
        highName={game.playerSet ? pgHandName(game.playerSet.hands.highScore) : undefined}
        lowResult={result(game.winners.low, true)}
        highResult={result(game.winners.high, true)}
        picked={game.picked}
        onPick={setting ? (i) => game.toggle(i) : undefined}
        {flipMs}
      />
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>Seven cards: set the best five as your high hand and two as your low. Win both to get paid; win one and it pushes.</p>
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
  {/snippet}

  {#snippet action()}
    <div class="bar">
      {#if setting}
        <div class="choice" role="group" aria-label="Set your hand">
          <button type="button" class="act" onclick={() => game.showHouseWay()}>
            House way <kbd>H</kbd>
          </button>
          <button type="button" class="act primary" disabled={!game.canSet} onclick={() => game.confirm()}>
            Set hand <kbd>Space</kbd>
          </button>
        </div>
        <p class="hint" class:foul={preview && !preview.legal}>
          {#if !preview}
            Tap two cards for your low hand{game.picked.length === 1 ? ' — one more' : ''}
          {:else if !preview.legal}
            Foul: the high hand must beat the low hand
          {:else}
            High: {pgHandName(preview.hands.highScore)} · Low: {lowName(preview.hands.lowScore)}
          {/if}
        </p>
      {:else if seq.awaiting === 'deal'}
        <button type="button" class="act primary" onclick={() => game.deal()}>Deal</button>
      {:else if game.started && !game.gameOver}
        <p class="hint">{game.autoPlay ? `Auto playing · ${seq.speed}` : 'Dealing…'}</p>
        {#if game.autoPlay}
          <button type="button" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet panels()}
    <section class="panel">
      <h2>Bet <span>applies to the next hand</span></h2>
      <div class="row">
        <span>Bet</span>
        <span class="stepper">
          <button type="button" onclick={() => game.changeBet(0.5)} aria-label="Halve bet">−</button>
          <b>{formatMoney(game.bet)}</b>
          <button type="button" onclick={() => game.changeBet(2)} aria-label="Double bet">+</button>
        </span>
      </div>
      <p class="note">
        Win both hands: paid 1:1, less 5% commission. Win one: push. Ties go to the dealer. Max at risk:
        {formatMoney(game.bet.add(game.side.total))}.
      </p>
    </section>

    <SideBetsPanel stakes={game.side} base={game.bet} results={game.bonusResults} />

    <section class="panel">
      <h2>Last hand</h2>
      <Breakdown lines={game.last?.lines ?? []} net={game.last?.net ?? null} ante={game.lastBet} />
    </section>

    <section class="panel">
      <h2>Session</h2>
      <dl>
        <dt>Hands</dt>
        <dd>{game.hands}</dd>
        <dt>Net</dt>
        <dd class:win={game.sessionNet.gt(0)} class:loss={game.sessionNet.lt(0)}>{formatMoney(game.sessionNet, true)}</dd>
        <dt>Won · pushed · lost</dt>
        <dd>{game.outcomes.win} · {game.outcomes.push} · {game.outcomes.lose}</dd>
        <dt>Biggest win</dt>
        <dd>{formatMoney(game.biggestWin)}</dd>
      </dl>
      <ol class="history">
        {#each game.history as h (h.round)}
          <li>
            <span class="muted">#{h.round}</span>
            <span>{h.high}</span>
            <span class="muted">{h.low}</span>
            <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{h.outcome === 'push' ? 'push' : formatMoney(h.net, true)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <section class="panel">
      <h2>Table</h2>
      <div class="speed" role="group" aria-label="Deal speed">
        {#each SPEEDS as s (s)}
          <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s}</button>
        {/each}
      </div>
      <label class="switch">
        <input type="checkbox" checked={muted} onchange={(e) => (muted = e.currentTarget.checked)} />
        Mute sound
      </label>
      <p class="muted small">Seed {game.runSeed} · hand {game.round}</p>
      <button type="button" onclick={() => game.restart()}>Restart</button>
    </section>
  {/snippet}
</TableShell>

<style>
  .layout {
    display: grid;
    gap: inherit;
    justify-items: center;
  }
  .middle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px 18px;
  }
  .bets {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .bets li {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 62px;
    min-height: 54px;
    padding: 6px 10px;
    border-radius: 12px;
    border: 2px dashed var(--line);
    opacity: 0.55;
  }
  .bets li.placed {
    opacity: 1;
    border-style: solid;
    border-color: var(--gold);
  }
  .bets .name {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .bets b {
    font: 700 15px/1.1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .bets small {
    font: 600 11px/1 var(--font-ui);
    color: var(--gold);
  }
  .bets li.side {
    border-style: dashed;
  }
  .bets li.win {
    border-style: solid;
    border-color: var(--win);
  }
  .bets li.loss {
    border-style: solid;
    border-color: var(--loss);
  }
  .bets .win .result-net {
    color: var(--win);
  }
  .bets .loss .result-net {
    color: var(--loss);
  }
  .result {
    display: grid;
    justify-items: center;
  }
  .banner {
    margin: 0;
    font: 700 18px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: center;
    animation: pop 300ms ease-out;
  }
  .banner.win {
    color: var(--win);
  }
  .banner.loss {
    color: var(--loss);
  }
  .banner.big {
    font-size: 24px;
    color: var(--gold);
    text-shadow: 0 0 18px var(--gold);
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
    max-width: 36ch;
    color: var(--muted);
  }

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
    padding: 12px 18px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .choice .act {
    flex: 1 1 0;
  }
  /* Short landscape puts the action bar in a narrow side column: stack the choices. */
  @media (orientation: landscape) and (max-height: 520px) {
    .bar,
    .choice {
      flex-direction: column;
      align-items: stretch;
    }
    .choice {
      flex: 0 0 auto;
    }
    .hint {
      text-align: center;
    }
  }
  .hint {
    margin: 0;
    font: 13px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .hint.foul {
    color: var(--loss);
  }
  .act:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  .panel h2 {
    margin: 0;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .panel h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font: 13px/1.3 var(--font-ui);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper button {
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 16px;
  }
  .stepper b {
    min-width: 56px;
    text-align: center;
    font: 700 15px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
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
    font: 12px/1.4 var(--font-ui);
  }
  .history li {
    display: grid;
    grid-template-columns: 36px 1fr auto auto;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    width: fit-content;
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
  .small {
    font-size: 12px;
    margin: 0;
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
  /* Landscape phones are short: compact betting spots. */
  @media (orientation: landscape) and (max-height: 520px) {
    .bets {
      gap: 4px;
    }
    .bets li {
      min-width: 48px;
      min-height: 0;
      padding: 2px 6px;
      border-width: 1.5px;
      border-radius: 9px;
    }
    .bets .name {
      font-size: 9px;
      letter-spacing: 0.06em;
    }
    .bets b {
      font-size: 13px;
    }
    .bets small {
      font-size: 10px;
    }
  }
</style>
