<script lang="ts">
  import { onDestroy } from 'svelte';
  import { FEVER_BALLS, FEVER_CHANCE, FEVER_X, plinkoOdds, PLINKO_RISKS, PLINKO_ROWS } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { PlinkoGame, type Ball } from './plinko.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new PlinkoGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  /** The board in its own units: the pegs fan out from the top, a slot under each gap at the bottom. */
  const W = 1000;
  const s = $derived(W / (game.rows + 2));
  const top = $derived(s * 0.9);
  const rowY = (r: number) => top + r * s * 0.86;
  const slotY = $derived(rowY(game.rows) + s * 0.1);
  const H = $derived(slotY + s * 0.75);
  const pegs = $derived(
    Array.from({ length: game.rows }, (_, r) => Array.from({ length: r + 3 }, (_, j) => ({ x: W / 2 + (j - (r + 2) / 2) * s, y: rowY(r) }))).flat(),
  );
  const slotX = (k: number, rows: number, size: number) => W / 2 + (k - rows / 2) * size;

  /** A slot's colour: cool in the middle, hot at the edges, by how far out it is. */
  function heat(k: number): string {
    const d = Math.abs(k - game.rows / 2) / (game.rows / 2);
    const hue = 200 - d * 200;
    return `hsl(${hue < 0 ? 360 + hue : hue} 85% ${50 + d * 6}%)`;
  }
  /** A slot's multiplier, short enough to fit even 17 slots across: 1000 as 1K. */
  const label = (x: number) => (x >= 1000 ? `${+(x / 1000).toFixed(1)}K` : x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));

  /**
   * A ball's fall, as an animation: a hop from peg to peg down its path, left
   * or right at each, then into its slot, where it pays.
   */
  function fall(node: SVGGElement, ball: Ball) {
    const size = W / (ball.rows + 2);
    const y0 = size * 0.9;
    const ry = (r: number) => y0 + r * size * 0.86;
    const radius = size * 0.22;
    const frames: Keyframe[] = [{ transform: `translate(${W / 2}px, ${-size * 0.4}px)`, easing: 'ease-in' }];
    let x = W / 2;
    for (let r = 0; r < ball.rows; r++) {
      const y = ry(r) - radius * 1.6;
      frames.push({ transform: `translate(${x}px, ${y}px)`, easing: 'ease-out' });
      x += (ball.path[r] ? 0.5 : -0.5) * size;
      frames.push({ transform: `translate(${(x + (x - (ball.path[r] ? 0.5 : -0.5) * size)) / 2}px, ${y - size * 0.18}px)`, easing: 'ease-in' });
    }
    frames.push({ transform: `translate(${x}px, ${ry(ball.rows) + size * 0.25}px)` });
    const anim = node.animate(frames, { duration: game.rowMs * (ball.rows + 1), fill: 'forwards' });
    const ticks = Array.from({ length: ball.rows }, (_, r) => setTimeout(() => game.bounce(), (game.rowMs * (r + 1) * (ball.rows + 1)) / (ball.rows + 1)));
    anim.onfinish = () => game.land(ball);
    return {
      destroy() {
        anim.cancel();
        ticks.forEach(clearTimeout);
      },
    };
  }

  function onTap() {
    if (game.started) game.drop();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside, button')) return;
    if (e.key === 'ArrowUp') return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown') return game.setStep(game.step - 1);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    game.drop();
  }

  function begin() {
    unlockAudio();
    game.start();
  }

  const odds = $derived(plinkoOdds(game.rows));
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Pick a board', demo: '8 · 12 · 16', text: 'More rows, longer odds at the edges. Higher risk, bigger edges and a stingier middle.' },
    { title: 'Drop', demo: '●', text: 'Each ball is a bet of its own. It bounces left or right at every peg, as likely one way as the other.' },
    { title: 'Land', demo: '×', text: 'The slot it lands in pays your bet times its multiplier. The middle can pay less than the ball.' },
  ]}
>
  {#snippet goal()}
    Drop balls through the pegs and hope they stray to the edges.
  {/snippet}
  <details open>
    <summary>The odds on this board</summary>
    <ul>
      <li>
        At every peg the ball goes left or right with an even chance, so it lands in each slot as often as the number of
        paths to it: the middle most, the edges least. With {game.rows} rows, an edge slot takes about 1 ball in
        {Math.round(1 / odds[0]!).toLocaleString('en-US')} on each side.
      </li>
      <li>
        <b>Fever.</b> About one ball in {Math.round(1 / FEVER_CHANCE)} drops golden. It lands and pays like any ball, then sets off
        Fever: {FEVER_BALLS} free balls on the same board, every slot paying ×{FEVER_X}.
      </li>
      <li>
        This board pays back {(game.payback * 100).toFixed(2)}%, Fever included, exactly: each slot's multiplier times its chance, added
        up, plus Fever's share. Every board is within a sixth of a percent of {(game.rtp * 100).toFixed(0)}%.
      </li>
      <li>Balls in flight are already bet; the board's rows and risk can change once they've all landed.</li>
    </ul>
  </details>
</RulesFrame>

<TableShell
  machine
  cabinet="plinko"
  title={['Lucky', 'Drop']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={onTap}
>
  {#snippet felt()}
    <div class="stage plinko-stage" class:fever={!!game.fever}>
      <!-- The board's settings, on the cabinet over it: they lock while balls are falling. -->
      <div class="options">
        <div class="segmented" role="group" aria-label="Rows">
          <span class="k">Rows</span>
          {#each PLINKO_ROWS as r (r)}
            <button type="button" aria-pressed={game.rows === r} disabled={game.locked} onclick={() => game.setRows(r)}>{r}</button>
          {/each}
        </div>
        <div class="segmented" role="group" aria-label="Risk">
          <span class="k">Risk</span>
          {#each PLINKO_RISKS as r (r)}
            <button type="button" aria-pressed={game.risk === r} disabled={game.locked} onclick={() => game.setRisk(r)}>{r}</button>
          {/each}
        </div>
      </div>
      <svg class="board" viewBox="0 {-s} {W} {H + s}" role="img" aria-label="Plinko board, {game.rows} rows">
        <defs>
          <radialGradient id="peg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="1" stop-color="#9fb4ff" />
          </radialGradient>
          <radialGradient id="goldg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.5" stop-color="#ffd75e" />
            <stop offset="1" stop-color="#b8861e" />
          </radialGradient>
          <radialGradient id="ballg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#fff6c8" />
            <stop offset="0.6" stop-color="#ff9ad9" />
            <stop offset="1" stop-color="#c2409c" />
          </radialGradient>
        </defs>
        {#each pegs as p, i (i)}
          <circle class="peg" cx={p.x} cy={p.y} r={s * 0.09} fill="url(#peg)" />
        {/each}
        {#each game.pays as x, k (k)}
          {@const hit = game.hits[k]}
          <g class="slot" transform="translate({slotX(k, game.rows, s)} {slotY})">
            {#key hit?.key}
              <g class:bump={!!hit}>
                <rect x={-s * 0.46} y="0" width={s * 0.92} height={s * 0.62} rx={s * 0.12} fill={heat(k)} />
                <text y={s * 0.42} text-anchor="middle" font-size={Math.min(s * 0.36, 34)}>{label(game.fever ? x * FEVER_X : x)}{game.rows < 16 ? '×' : ''}</text>
              </g>
              {#if hit}
                <text class="gain" class:big={hit.x >= 1} y={-s * 0.2} text-anchor="middle" font-size={Math.min(s * 0.32, 30)}>
                  {hit.x >= 1 ? '+' : ''}{formatMoney(hit.pay)}
                </text>
              {/if}
            {/key}
          </g>
        {/each}
        {#each game.balls as ball (ball.id)}
          <g use:fall={ball}>
            <circle r={(W / (ball.rows + 2)) * (ball.golden ? 0.27 : 0.22)} fill={ball.golden ? 'url(#goldg)' : 'url(#ballg)'} class="ball" class:golden={ball.golden} class:feverball={ball.fever} />
          </g>
        {/each}
      </svg>

      {#if game.fever}
        <!-- Fever: the board lit up, and the free balls counting down. -->
        <div class="fever-banner" aria-live="polite">
          <b>Fever!</b>
          <span>{FEVER_BALLS - game.fever.left} / {FEVER_BALLS} free balls · every slot ×{FEVER_X}</span>
        </div>
      {/if}

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Drop balls through the pegs. Each bounces left or right at every peg and lands in a slot that multiplies its bet: the edges pay big, the middle pays least."
        hands={game.rounds}
        biggestWin={game.biggestWin}
        onSeat={begin}
        onRules={() => rules?.open()}
        onRestart={() => game.restart()}
      />
    </div>
  {/snippet}

  {#snippet action()}
    <div class="bar">
      <BetPicker {game} />
      <button type="button" class="go primary" disabled={!game.canBet || game.autoPlay || !!game.fever} onclick={() => game.drop()}>
        {game.fever ? 'Fever!' : 'Drop ball'}
      </button>
      <span class="note">
        {game.fever ? 'The free balls are falling' : game.balls.length ? `${game.balls.length} in play · the board can change once they land` : 'Space drops a ball · 1 in ' + Math.round(1 / FEVER_CHANCE) + ' drops golden'}
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
      stats={game.stats('Balls')}
      sessionNet={game.sessionNet}
      history={game.history}
    >
      <section class="panel ipanel">
        <h2>This board <span>{game.rows} rows · {game.risk} risk</span></h2>
        <table class="ladder">
          <thead><tr><th>Slot</th><th>Pays</th><th>Lands</th></tr></thead>
          <tbody>
            {#each game.pays.slice(0, game.rows / 2 + 1) as x, k (k)}
              <tr>
                <td>{k === game.rows / 2 ? 'Middle' : k === 0 ? 'Edges' : `${game.rows / 2 - k} from the middle`}</td>
                <td>{label(x)}× · {formatMoney(game.bet.mul(x))}</td>
                <td>{((k === game.rows / 2 ? 1 : 2) * odds[k]! * 100).toFixed(odds[k]! < 0.001 ? 3 : 1)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">Pays back {(game.payback * 100).toFixed(2)}%, Fever included, exactly. A golden ball's Fever pays ×{FEVER_X} on {FEVER_BALLS} free balls.</p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  .plinko-stage {
    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
    gap: 6px;
    padding: 4px 4px 0;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    z-index: 1;
  }
  .board {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: visible;
  }
  .peg {
    filter: drop-shadow(0 0 4px rgb(159 180 255 / 0.8));
  }
  .ball {
    filter: drop-shadow(0 0 8px #ff7ad9);
  }
  .ball.golden {
    filter: drop-shadow(0 0 10px #ffd75e) drop-shadow(0 0 22px rgb(255 215 94 / 0.8));
    animation: gleam 0.5s ease-in-out infinite alternate;
  }
  .ball.feverball {
    filter: drop-shadow(0 0 10px #7ad8ff) drop-shadow(0 0 4px #fff);
  }
  @keyframes gleam {
    to {
      filter: drop-shadow(0 0 16px #fff3b0) drop-shadow(0 0 30px rgb(255 215 94 / 0.9));
    }
  }
  /* Fever lights the board: the pegs cycle colour and the cabinet glows. */
  .fever .peg {
    animation: hue 1.4s linear infinite;
    filter: drop-shadow(0 0 6px #ff7ad9);
  }
  .fever .board {
    filter: drop-shadow(0 0 30px rgb(255 122 217 / 0.35));
  }
  @keyframes hue {
    to {
      filter: hue-rotate(360deg) drop-shadow(0 0 6px #7ad8ff);
    }
  }
  .fever-banner {
    position: absolute;
    top: 52px;
    left: 50%;
    translate: -50% 0;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 10px 22px;
    border-radius: 14px;
    background: rgb(26 10 46 / 0.9);
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 30px rgb(255 122 217 / 0.6);
    animation: slam 0.5s cubic-bezier(0.2, 1.8, 0.4, 1);
    pointer-events: none;
  }
  .fever-banner b {
    font: 700 30px/1 var(--font-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(90deg, #ffd75e, #ff7ad9, #7ad8ff, #ffd75e);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sweep 1.2s linear infinite;
  }
  .fever-banner span {
    font: 600 12px/1 var(--font-ui);
    color: #f6e3ff;
  }
  @keyframes slam {
    from {
      scale: 2.4;
      opacity: 0;
    }
  }
  @keyframes sweep {
    to {
      background-position: 200% 0;
    }
  }
  .slot text {
    font-family: var(--font-display);
    font-weight: 700;
    fill: #1a0a2e;
  }
  .slot .gain {
    fill: #fff;
    stroke: #1a0a2e;
    stroke-width: 4px;
    paint-order: stroke;
    animation: rise 1.1s ease-out forwards;
  }
  .slot .gain.big {
    fill: #8cf08a;
  }
  .bump {
    animation: bump 380ms cubic-bezier(0.3, 1.6, 0.5, 1);
    filter: brightness(1.5) drop-shadow(0 0 10px #fff);
  }
  @keyframes bump {
    40% {
      transform: translateY(8px);
    }
  }
  @keyframes rise {
    to {
      transform: translateY(-40px);
      opacity: 0;
    }
  }
  .ladder {
    width: 100%;
    border-collapse: collapse;
    font: 13px/1.5 var(--font-ui);
  }
  .ladder th {
    text-align: left;
    color: var(--muted);
    font-weight: 600;
  }
  .ladder td:nth-child(n + 2),
  .ladder th:nth-child(n + 2) {
    text-align: right;
  }
</style>
