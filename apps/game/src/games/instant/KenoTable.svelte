<script lang="ts">
  import { onDestroy } from 'svelte';
  import { GOLD_BALL_X, KENO_DRAWN, KENO_MAX_SPOTS, KENO_NUMBERS, kenoOdds } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { KenoGame } from './keno.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new KenoGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  const numbers = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  const spots = $derived(game.picks.length);
  const picked = $derived(new Set(game.picks));
  const drawn = $derived(game.drawn);
  const gold = $derived(game.balls.length === KENO_DRAWN ? game.balls[KENO_DRAWN - 1]! : null);
  const odds = $derived(kenoOdds(Math.max(1, spots)));
  /** The ticket's winning lines, most hits first: what each catch pays. */
  const lines = $derived(
    game.pays
      .map((x, k) => ({ k, x, p: odds[k]! }))
      .filter((l) => l.x > 0)
      .reverse(),
  );
  const top = $derived(Math.max(...game.pays));
  const fmtX = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
  const pct = (p: number) => (p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `1 in ${Math.round(1 / p).toLocaleString('en-US')}`);

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside, button')) return;
    if (e.key === 'ArrowUp' && !game.drawing) return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown' && !game.drawing) return game.setStep(game.step - 1);
    if (e.key === 'q') return game.quickPick();
    if (e.key === 'c') return game.clearPicks();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!game.autoPlay) void game.play();
  }

  function begin() {
    unlockAudio();
    game.start();
    if (!game.picks.length) game.quickPick(5);
  }
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Mark your numbers', demo: '1–10 of 80', text: 'Tap the numbers you like, or Quick pick. More numbers, longer odds and bigger prizes.' },
    { title: 'Twenty balls', demo: '20 drawn', text: 'Twenty of the eighty are drawn, one at a time. Every one of yours that comes up is a hit.' },
    { title: 'Get paid', demo: '5 of 6', text: 'The ticket pays by how many hits it caught. The last ball is gold: catch it and the win is multiplied.' },
  ]}
  glance={[
    {
      heading: 'Your ticket',
      items: [
        { name: 'Bet', tag: 'one bet a draw', text: 'Set with − and +. The ticket plays for that bet, draw after draw, until you change it.' },
        { name: 'Spots', tag: '1 to 10', text: 'The numbers you mark. Each count has its own pay table, in the Pays tab: more spots, rarer hits, bigger tops.' },
        { name: 'Hits', text: 'Your numbers among the 20 drawn. The more you catch, the more the ticket pays; too few pays nothing.' },
      ],
    },
    {
      heading: 'The gold ball',
      note: 'The twentieth ball drawn is gold.',
      items: [
        { name: 'Catch it', tag: `wins ×${GOLD_BALL_X}`, text: `If the gold ball is one of your numbers, whatever the ticket wins is multiplied by ${GOLD_BALL_X}.` },
        { name: 'How often', tag: `${Math.max(1, spots)} in 80`, text: 'The gold ball is any one of the 80 numbers, so each number you mark is another chance at it.' },
      ],
    },
  ]}
>
  {#snippet goal()}
    Mark up to ten numbers and <b>catch as many as you can</b> among the twenty drawn.
  {/snippet}
  <details>
    <summary>The odds</summary>
    <ul>
      <li>Every ball is drawn at random from those left, so every number is as likely as any other. Past draws don't change the next.</li>
      <li>
        The chance of each catch is exact: of the 20 balls, how many fall among your numbers. With {Math.max(1, spots)}
        {spots === 1 ? 'spot' : 'spots'}, catching them all is {pct(odds[Math.max(1, spots)]!)}.
      </li>
      <li>
        Every ticket pays back {(game.payback * 100).toFixed(1)}%, the gold ball included, however many numbers you mark. Each table is
        scaled to the floor's payback exactly.
      </li>
    </ul>
  </details>
  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>Space</kbd> draws · <kbd>Q</kbd> quick pick · <kbd>C</kbd> clears the ticket · arrow keys change the bet.</li>
      <li>Your numbers stay marked from draw to draw, and auto play keeps drawing on them.</li>
    </ul>
  </details>
</RulesFrame>

<TableShell
  {seq}
  machine
  cabinet="keno"
  title={['Golden', 'Keno']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
>
  {#snippet felt()}
    <div class="istage keno">
      <!-- The draw: twenty balls in the order they came out, the last one gold. -->
      <div class="tray" aria-label="Balls drawn" aria-live="polite">
        {#each { length: KENO_DRAWN } as _, i (i)}
          {@const ball = game.balls[i]}
          <span class="slot" class:last={i === KENO_DRAWN - 1}>
            {#if ball !== undefined}
              <span class="ball" class:hit={picked.has(ball)} class:gold={i === KENO_DRAWN - 1}>{ball}</span>
            {/if}
          </span>
        {/each}
      </div>

      <div class="board" role="group" aria-label="Keno board, 1 to 80">
        {#each numbers as n (n)}
          {@const mine = picked.has(n)}
          {@const out = drawn.has(n)}
          <button
            type="button"
            class="cell"
            class:mine
            class:out
            class:hit={mine && out}
            class:gold={gold === n}
            aria-pressed={mine}
            disabled={game.drawing || (!mine && spots >= KENO_MAX_SPOTS)}
            onclick={() => game.toggle(n)}
          >
            {n}
          </button>
        {/each}
      </div>

      <!-- What this ticket pays, lit at the catch it's on. -->
      <ol class="paystrip" aria-label="This ticket's pays">
        {#each lines as l (l.k)}
          <li class:now={(game.drawing || game.result) && game.hits === l.k} class:top={l.x === top}>
            <span class="k">{l.k} of {spots || 1}</span>
            <b>{fmtX(l.x)}×</b>
          </li>
        {/each}
      </ol>

      {#if game.result}
        {@const r = game.result}
        {#key game.rounds}
          <div class="verdict" class:won={r.pay > 0} class:gold={r.gold && r.pay > 0}>
            <span>{r.hits.length} of {spots} caught{r.gold ? ' · gold ball!' : ''}</span>
            <b>{r.pay > 0 ? `+${formatMoney(game.lastBet.mul(r.pay))}` : 'No win'}</b>
          </div>
        {/key}
      {/if}

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Mark up to ten numbers of 80, then twenty balls are drawn. The more of yours come up, the more the ticket pays, and the last ball is gold."
        hands={game.rounds}
        biggestWin={game.biggestWin}
        onSeat={begin}
        onRules={() => rules?.open()}
        onRestart={() => game.restart()}
      />
    </div>
  {/snippet}

  {#snippet action()}
    <div class="ibar">
      <BetPicker {game} />
      <div class="isegmented" role="group" aria-label="Ticket">
        <button type="button" disabled={game.drawing} onclick={() => game.quickPick()}>Quick pick</button>
        <button type="button" disabled={game.drawing || !spots} onclick={() => game.clearPicks()}>Clear</button>
      </div>
      <button type="button" class="go primary" disabled={!game.canPlay || game.autoPlay} onclick={() => game.play()}>
        {game.drawing ? 'Drawing…' : 'Draw'}
      </button>
      <span class="note">
        {spots ? `${spots} ${spots === 1 ? 'spot' : 'spots'} · tops out at ${fmtX(top)}×, ×${GOLD_BALL_X} on the gold ball` : 'Mark 1 to 10 numbers, or Quick pick'}
      </span>
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
      lastUnit={game.lastBet}
      stats={game.stats('Draws')}
      sessionNet={game.sessionNet}
      history={game.history}
    >
      <section class="panel ipanel">
        <h2>This ticket <span>{spots || 1} {spots === 1 ? 'spot' : 'spots'}</span></h2>
        <table class="ladder">
          <thead><tr><th>Catch</th><th>Pays</th><th>Chance</th></tr></thead>
          <tbody>
            {#each lines as l (l.k)}
              <tr>
                <td>{l.k} of {spots || 1}</td>
                <td>{fmtX(l.x)}× · {formatMoney(game.bet.mul(l.x))}</td>
                <td>{pct(l.p)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">
          Catch the gold ball (the last drawn) and the win is ×{GOLD_BALL_X}. Pays back {(game.payback * 100).toFixed(1)}%, gold ball included,
          exactly.
        </p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  .keno {
    container-type: size;
    gap: 2.2cqh;
    padding: 2cqh 2cqw;
    --cell: min(8.6cqw, 9cqh);
    --ball: min(4.3cqw, 6cqh);
  }

  .tray {
    display: grid;
    grid-template-columns: repeat(20, var(--ball));
    gap: min(0.5cqw, 0.6cqh);
    padding: 6px 10px;
    border-radius: 999px;
    background: linear-gradient(#050b17, #0b1a33);
    box-shadow:
      inset 0 2px 6px rgb(0 0 0 / 0.7),
      0 1px 0 rgb(255 255 255 / 0.06);
  }
  .slot {
    width: var(--ball);
    height: var(--ball);
    border-radius: 50%;
    background: rgb(255 255 255 / 0.04);
  }
  .slot.last {
    box-shadow: inset 0 0 0 1.5px rgb(232 192 106 / 0.6);
  }
  .ball {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff, #c9d6ea 60%, #8193b0);
    color: #0b1a33;
    font: 700 calc(var(--ball) * 0.42) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    animation: drop 260ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .ball.hit {
    background: radial-gradient(circle at 35% 30%, #fff, #8cf0b8 55%, #1f9a5a);
    box-shadow: 0 0 10px rgb(140 240 184 / 0.7);
  }
  .ball.gold {
    background: radial-gradient(circle at 35% 30%, #fff8dc, #ffd75e 50%, #b8861e);
    box-shadow: 0 0 14px rgb(255 215 94 / 0.9);
    color: #3a2600;
    animation: drop 500ms cubic-bezier(0.3, 1.5, 0.5, 1), shine 1.2s ease-in-out 500ms infinite alternate;
  }
  @keyframes drop {
    from {
      transform: translateY(-120%) scale(0.6);
      opacity: 0;
    }
  }
  @keyframes shine {
    to {
      box-shadow: 0 0 22px rgb(255 215 94 / 1);
    }
  }

  .board {
    display: grid;
    grid-template-columns: repeat(10, var(--cell));
    grid-auto-rows: calc(var(--cell) * 0.82);
    gap: min(0.6cqw, 0.7cqh);
    padding: min(1cqw, 1.2cqh);
    border-radius: 14px;
    background: rgb(4 10 22 / 0.65);
    box-shadow: inset 0 0 0 1px rgb(232 192 106 / 0.25);
  }
  .cell {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(#1a2f55, #13254a);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
    color: #cfdcf2;
    font: 600 calc(var(--cell) * 0.34) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    transition:
      background 120ms,
      transform 90ms;
  }
  .cell:hover:not(:disabled) {
    background: linear-gradient(#24407a, #1a3366);
  }
  .cell:disabled {
    opacity: 1;
    cursor: default;
  }
  /* Marked: a gold ticket number. */
  .cell.mine {
    background: linear-gradient(#f2c64e, #c8932c);
    color: #2a1a06;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 0 10px rgb(242 198 78 / 0.35);
  }
  .cell.mine:hover:not(:disabled) {
    background: linear-gradient(#ffd667, #d9a238);
  }
  /* Drawn, not yours: a dot of the ball on it. */
  .cell.out::after {
    content: '';
    position: absolute;
    inset: 18%;
    border-radius: 50%;
    border: 2px solid rgb(207 220 242 / 0.55);
  }
  /* Yours and drawn: a hit. */
  .cell.hit {
    background: radial-gradient(circle at 50% 40%, #b8ffd6, #2fbf6e 60%, #17804a);
    color: #04210f;
    animation: pop 320ms ease;
  }
  .cell.hit::after {
    border-color: #fff;
  }
  .cell.gold {
    outline: 3px solid #ffd75e;
    outline-offset: 1px;
  }
  .cell.gold.hit {
    background: radial-gradient(circle at 50% 40%, #fff8dc, #ffd75e 55%, #b8861e);
    box-shadow: 0 0 18px rgb(255 215 94 / 0.9);
  }
  @keyframes pop {
    40% {
      transform: scale(1.18);
    }
  }

  .paystrip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .paystrip li {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 62px;
    padding: 5px 10px;
    border-radius: 10px;
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
    transition:
      background 160ms,
      transform 160ms;
  }
  .paystrip .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .paystrip b {
    font: 700 15px/1 var(--font-display);
    color: #e8eef9;
    font-variant-numeric: tabular-nums;
  }
  .paystrip li.top b {
    color: var(--gold);
  }
  .paystrip li.now {
    background: linear-gradient(#2fbf6e, #17804a);
    transform: translateY(-2px);
    box-shadow: 0 0 14px rgb(47 191 110 / 0.5);
  }
  .paystrip li.now .k,
  .paystrip li.now b {
    color: #fff;
  }

  .verdict {
    position: absolute;
    left: 50%;
    top: 46%;
    translate: -50% -50%;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 14px 26px;
    border-radius: 16px;
    background: rgb(4 10 22 / 0.86);
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.5),
      inset 0 0 0 1px rgb(255 255 255 / 0.1);
    pointer-events: none;
    animation: verdict 2.4s ease forwards;
  }
  .verdict span {
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #bfd0ea;
  }
  .verdict b {
    font: 700 clamp(28px, 7cqw, 52px) / 1 var(--font-display);
    color: #8a9ab5;
  }
  .verdict:not(.won) b {
    font-size: clamp(22px, 5cqw, 34px);
  }
  .verdict.won b {
    color: #8cf0b8;
    text-shadow: 0 0 18px rgb(140 240 184 / 0.6);
  }
  .verdict.gold {
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.5),
      0 0 0 2px #ffd75e,
      0 0 30px rgb(255 215 94 / 0.5);
  }
  .verdict.gold b {
    color: #ffd75e;
    text-shadow: 0 0 20px rgb(255 215 94 / 0.7);
  }
  @keyframes verdict {
    0% {
      opacity: 0;
      scale: 0.8;
    }
    12%,
    75% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
      scale: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ball,
    .ball.gold,
    .cell.hit {
      animation: none;
    }
  }
  /* A tall, narrow felt (a phone): the tray in two rows of ten, so the balls stay big enough to read. */
  @container (max-aspect-ratio: 1 / 1) {
    .tray {
      --ball: min(8cqw, 5.2cqh);
      grid-template-columns: repeat(10, var(--ball));
      border-radius: 18px;
    }
    .board {
      --cell: min(8.3cqw, 6.4cqh);
      grid-auto-rows: var(--cell);
    }
  }
</style>
