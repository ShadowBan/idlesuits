<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { pocketColor, ROULETTE_EDGE } from '@idlesuits/sim';
  import ChipRack from '../../components/ChipRack.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import { RouletteGame, SPIN_MS, type RouletteReplay } from './game.svelte';
  import RouletteBoard from './RouletteBoard.svelte';
  import RouletteRules from './RouletteRules.svelte';
  import RouletteWheel from './RouletteWheel.svelte';

  let { onExit }: GameProps = $props();

  const game = new RouletteGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RouletteRules>();

  const compact = new MediaQuery('(max-width: 899px)');
  /** While the ball runs, and as it settles, the board shows the layout that was spun. */
  const showing = $derived(game.spinning || Object.keys(game.results).length ? game.spinLayout : game.layout);
  const landed = $derived(game.spinning ? null : game.pocket);
  /** The spin's result on show: a replay's, while one runs, else the last spin's. */
  const net = $derived(game.replaying ? game.replayNet : game.last ? game.lastUnit.mul(game.last.net) : null);

  /** Hot and cold: how often each number came up in the last hundred. */
  const counts = $derived.by(() => {
    const c = new Map<number, number>();
    for (const n of game.numbers) c.set(n, (c.get(n) ?? 0) + 1);
    return c;
  });
  const hot = $derived([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4));
  const reds = $derived(game.numbers.filter((n) => pocketColor(n) === 'red').length);
  const blacks = $derived(game.numbers.filter((n) => pocketColor(n) === 'black').length);
  const zeros = $derived(game.numbers.filter((n) => n === 0).length);

  function place(id: string) {
    game.place(id, heldValue(game.bank));
  }


  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      return game.undo();
    }
    if (e.key === 'r') return game.rebet();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button')) return;
    e.preventDefault();
    game.spin();
  }

  function begin() {
    unlockAudio();
    game.start();
  }
</script>

<svelte:window onkeydown={onKey} />

<RouletteRules bind:this={rules} />

<TableShell
  {seq}
  title={['Single Zero', 'Roulette']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  replay={game.replaying
    ? {
        label: 'the same spin, the same chips',
        result: game.replayDone && game.pocket !== null && game.replayNet ? `${game.pocket} · ${game.replayNet.gt(0) ? '+' : ''}${formatMoney(game.replayNet)}` : undefined,
        won: !!game.replayNet?.gt(0),
        done: game.replayDone,
        onClose: game.replayDone ? () => game.closeReplay() : undefined,
      }
    : null}
>
  {#snippet felt()}
    <div class="layout" class:compact={compact.current}>
      <div class="wheelside">
        <div class="wheel">
          <RouletteWheel pocket={game.pocket} spins={game.spins} duration={seq.duration(SPIN_MS)} spinning={game.spinning} />
        </div>
        <!-- The last numbers to come up, newest first. -->
        <ol class="recent" aria-label="Last numbers">
          {#each game.numbers.slice(0, compact.current ? 8 : 14) as n, i (i)}
            <li class={pocketColor(n)} class:newest={i === 0 && !game.spinning}>{n}</li>
          {/each}
        </ol>
        {#if landed !== null && net}
          {#key `${game.hands}:${game.spins}`}
            <div class="verdict {pocketColor(landed)}" class:held={!!game.replaying}>
              <b>{landed}</b>
              <span class:won={net.gt(0)}>{net.gt(0) ? `+${formatMoney(net)}` : net.lt(0) ? `−${formatMoney(net.neg())}` : 'Push'}</span>
            </div>
          {/key}
        {/if}
      </div>
      <div class="boardside">
        <RouletteBoard
          layout={showing}
          results={game.results}
          winning={landed}
          vertical={compact.current}
          disabled={game.spinning || (!!game.replaying && !game.replayDone) || !game.started}
          onPlace={place}
          onTake={(id) => game.take(id)}
        />
      </div>

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Lay chips on the numbers you like, or on red or black, odd or even, a dozen or a column. The ball picks one number, and every bet covering it pays."
        hands={game.hands}
        biggestWin={game.biggestWin}
        onSeat={begin}
        onRules={() => rules?.open()}
        onRestart={() => game.restart()}
      />
    </div>
  {/snippet}

  {#snippet action()}
    <div class="bar">
      <ChipRack bank={game.bank} />
      <div class="tools">
        <button type="button" disabled={!game.canUndo} onclick={() => game.undo()}>Undo</button>
        <button type="button" disabled={game.spinning || game.total.lte(0)} onclick={() => game.clear()}>Clear</button>
        <button type="button" disabled={game.spinning || game.total.lte(0)} onclick={() => game.double()}>×2</button>
        <button type="button" disabled={!game.canRebet} onclick={() => game.rebet()}>Rebet</button>
      </div>
      <div class="go">
        {#if game.autoPlay && game.started}
          <button type="button" class="pause" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
        {:else}
          <button type="button" class="spin primary" disabled={!game.canSpin || seq.awaiting !== 'spin'} onclick={() => game.spin()}>
            {game.spinning ? 'No more bets' : 'Spin'}
          </button>
        {/if}
        <span class="total" class:hint={!!game.hint}>{game.hint ?? (game.total.gt(0) ? `Bet ${formatMoney(game.total)}` : 'Tap the layout to bet')}</span>
      </div>
    </div>
  {/snippet}

  {#snippet panels()}
    <TablePanels
      {seq}
      autoPlay={game.autoPlay}
      onAuto={(on) => game.setAutoPlay(on)}
      seed={game.runSeed}
      round={game.round}
      last={game.last}
      lastUnit={game.lastUnit}
      stats={[
        ['Spins', String(game.hands)],
        ['Biggest win', formatMoney(game.biggestWin)],
        [`Tokens by spin net${game.tokensPerBet ? '' : ' · paying'}`, game.tokensBySpin.toFixed(1)],
        [`Tokens by winning bets${game.tokensPerBet ? ' · paying' : ''}`, game.tokensByBet.toFixed(1)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: String(h.pocket), sub: `${formatMoney(h.staked)} down`, net: h.net }))}
      replay={{ data: game.lastReplay, play: (d) => game.replay(d as RouletteReplay), busy: game.spinning || (!!game.replaying && !game.replayDone) }}
    >
      {#snippet record()}
        <section class="panel">
          <h2>Last {game.numbers.length} numbers <span>this table</span></h2>
          {#if game.numbers.length}
            <div class="split">
              <span class="red">Red {reds}</span>
              <span class="black">Black {blacks}</span>
              <span class="green">Zero {zeros}</span>
            </div>
            <p class="hot">Most often: {#each hot as [n, c], i (n)}{i ? ', ' : ''}<b class={pocketColor(n)}>{n}</b> ×{c}{/each}</p>
            <p class="note">Every spin is new: the wheel has no memory, and no number is ever due.</p>
          {:else}
            <p class="note">No spins yet.</p>
          {/if}
        </section>
      {/snippet}
      <section class="panel">
        <h2>Pays <span>every bet, edge {(ROULETTE_EDGE * 100).toFixed(2)}%</span></h2>
        <table class="pays">
          <tbody>
            <tr><td>Straight up · 1 number</td><td>35:1</td></tr>
            <tr><td>Split · 2</td><td>17:1</td></tr>
            <tr><td>Street or trio · 3</td><td>11:1</td></tr>
            <tr><td>Corner or first four · 4</td><td>8:1</td></tr>
            <tr><td>Six line · 6</td><td>5:1</td></tr>
            <tr><td>Dozen or column · 12</td><td>2:1</td></tr>
            <tr><td>Red, black, odd, even, 1–18, 19–36</td><td>1:1</td></tr>
          </tbody>
        </table>
        <p class="note">Zero loses every outside bet. Right-click a bet to take its chips back.</p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  /* The wheel over the layout, the last numbers beside it; the layout runs the felt's full width. */
  .layout {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 2cqh;
    height: 100%;
    min-height: 0;
    padding: 0 1cqw;
  }
  .wheelside {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    min-height: 0;
    height: 100%;
  }
  .wheel {
    height: 100%;
    max-height: 50cqh;
    aspect-ratio: 1;
  }
  .boardside {
    display: grid;
    align-items: center;
    min-height: 0;
  }
  /* Clear of the rail where the felt curves in at the foot. */
  .layout:not(.compact) .boardside {
    padding: 0 8cqw 5cqh;
  }
  .layout:not(.compact) .recent {
    display: grid;
    grid-template-columns: repeat(2, 30px);
    align-content: center;
  }

  /* A phone: the upright layout down one side, the wheel and the numbers beside it. */
  .layout.compact {
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    padding: 0;
  }
  .layout.compact .wheelside {
    flex-direction: column;
    gap: 12px;
  }
  .layout.compact .boardside {
    order: -1;
    height: 100%;
    width: calc(100cqh * 4.2 / 14);
    max-width: 52cqw;
  }
  .layout.compact .wheel {
    height: auto;
    width: min(100%, 44cqh);
  }

  .recent {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-width: 100%;
  }
  .recent li {
    display: grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 4px;
    border-radius: 6px;
    font: 700 13px/1 var(--font-display);
    color: #fff;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15);
  }
  .recent .red {
    background: #c62a36;
  }
  .recent .black {
    background: #17171d;
  }
  .recent .green {
    background: #1d8a4e;
  }
  .recent .newest {
    outline: 2px solid #ffd75e;
    outline-offset: 1px;
    animation: arrive 500ms ease;
  }
  @keyframes arrive {
    from {
      transform: scale(1.5);
    }
  }

  .verdict {
    position: absolute;
    left: 50%;
    top: 38%;
    translate: -50% -50%;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 10px 20px;
    border-radius: 14px;
    background: rgb(10 8 6 / 0.82);
    box-shadow:
      0 8px 24px rgb(0 0 0 / 0.5),
      inset 0 0 0 2px rgb(255 255 255 / 0.12);
    pointer-events: none;
    animation: verdict 2.6s ease forwards;
  }
  .verdict b {
    display: grid;
    place-items: center;
    min-width: 54px;
    height: 54px;
    border-radius: 50%;
    font: 700 30px/1 var(--font-display);
    color: #fff;
  }
  .verdict.red b {
    background: #c62a36;
  }
  .verdict.black b {
    background: #17171d;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.3);
  }
  .verdict.green b {
    background: #1d8a4e;
  }
  .verdict span {
    font: 700 18px/1.2 var(--font-display);
    color: #c9b9a6;
  }
  .verdict span.won {
    color: #8cf0b8;
    text-shadow: 0 0 14px rgb(140 240 184 / 0.6);
  }
  /* A replay's result stays up while the replay holds. */
  .verdict.held {
    animation: verdict-in 300ms ease both;
  }
  @keyframes verdict-in {
    from {
      opacity: 0;
      scale: 0.7;
    }
  }
  @keyframes verdict {
    0% {
      opacity: 0;
      scale: 0.7;
    }
    10%,
    80% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 14px;
    min-height: 58px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .tools {
    display: flex;
    gap: 4px;
  }
  .tools button {
    min-height: 0;
    padding: 8px 11px;
    font: 600 13px/1 var(--font-ui);
  }
  .go {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  .spin {
    min-width: 130px;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background:
      linear-gradient(rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 50%),
      linear-gradient(#f2c64e, #b8862a);
    color: #2a1a06;
    font: 700 17px/1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 4px 0 #6e4e14,
      0 6px 14px rgb(0 0 0 / 0.45);
  }
  .spin:hover:not(:disabled) {
    background:
      linear-gradient(rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 50%),
      linear-gradient(#f2c64e, #b8862a);
    filter: brightness(1.08);
  }
  .spin:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 1px 0 #6e4e14;
  }
  .spin:disabled {
    opacity: 0.4;
  }
  .pause {
    min-width: 130px;
    min-height: 46px;
  }
  .total {
    font: 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .total.hint {
    color: #ffb4a6;
  }

  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 8px;
  }
  .panel h2 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .panel h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .split {
    display: flex;
    gap: 6px;
  }
  .split span {
    flex: 1;
    padding: 6px;
    border-radius: 6px;
    text-align: center;
    font: 600 12px/1 var(--font-ui);
    color: #fff;
  }
  .split .red,
  .hot .red {
    background: #c62a36;
  }
  .split .black,
  .hot .black {
    background: #17171d;
  }
  .split .green,
  .hot .green {
    background: #1d8a4e;
  }
  .hot {
    margin: 8px 0 0;
    font: 13px/1.8 var(--font-ui);
  }
  .hot b {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    padding: 0 4px;
    border-radius: 4px;
    color: #fff;
  }
  .note {
    margin: 6px 0 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .pays {
    width: 100%;
    font: 13px/1.6 var(--font-ui);
  }
  .pays td:last-child {
    text-align: right;
    font-weight: 700;
    color: var(--gold);
  }

  /* Phones: the bar keeps to the chips, the spin and its total; the tools tuck under. */
  :global(.app.compact) .bar {
    gap: 6px 8px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  }
</style>
