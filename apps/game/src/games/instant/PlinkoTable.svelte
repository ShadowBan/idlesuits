<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { player } from '../../lib/player.svelte';
  import { PIN_SHARE, PRIZE_BALLS } from '@idlesuits/engine';
  import { FEVER_BALLS, FEVER_CHANCE, FEVER_LADDER, FEVER_LIFT, plinkoOdds, PLINKO_RISKS, PLINKO_ROWS } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { PlinkoGame, type Ball, type PlinkoReplay } from './plinko.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new PlinkoGame();
  const seq = game.seq;
  // Signed in (or out) after the table opened: the board's lights and pot are the account's.
  $effect(() => {
    void player.member;
    void player.ready;
    untrack(() => game.resync());
  });
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  /**
   * The board in its own units: the pegs fan out from the top, a slot under
   * each gap at the bottom. Row r has the r + 1 pegs a ball can reach: after r
   * bounces it sits over one of them, never past either end.
   */
  const W = 1000;
  const s = $derived(W / (game.rows + 2));
  const top = $derived(s * 0.9);
  const rowY = (r: number) => top + r * s * 0.86;
  const slotY = $derived(rowY(game.rows) + s * 0.1);
  const H = $derived(slotY + s * 0.75);
  const pegs = $derived(
    Array.from({ length: game.rows }, (_, r) => Array.from({ length: r + 1 }, (_, j) => ({ x: W / 2 + (j - r / 2) * s, y: rowY(r) }))).flat(),
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
    const duration = game.rowMs * (ball.rows + 1);
    const anim = node.animate(frames, { duration, fill: 'forwards' });
    // The frames are spread evenly: the ball reaches row r's pin at frame 1 + 2r of them.
    const ticks = Array.from({ length: ball.rows }, (_, r) => setTimeout(() => game.touch(ball, r), (duration * (1 + 2 * r)) / (frames.length - 1)));
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
  /** What a Fever pays on this board, on average, in bets: its free balls' ladder times the board's own slots. */
  const feverAvg = $derived(((game.slotPayback / FEVER_LIFT) * FEVER_LADDER.reduce<number>((a, b) => a + b, 0)));
  /** Pins worth naming during Prize Pins: the biggest prizes on the board. */
  const named = $derived.by(() => {
    const sorted = [...game.shares].sort((a, b) => b - a);
    const cut = sorted[Math.min(sorted.length - 1, game.rows === 8 ? 7 : 11)]!;
    return new Set(game.shares.flatMap((x, i) => (x >= cut ? [i] : [])));
  });
  /** The ladder step falling now, while Fever runs. */
  const boost = $derived(game.fever && !game.fever.done ? FEVER_LADDER[game.fever.step]! : 1);
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Pick a board', demo: '8 · 12 · 16', text: 'More rows, longer odds at the edges. Higher risk, bigger edges and a stingier middle.' },
    { title: 'Drop', demo: '●', text: 'Each ball is a bet of its own. It bounces left or right at every peg, as likely one way as the other.' },
    { title: 'Land', demo: '×', text: 'The slot it lands in pays your bet times its multiplier. The middle can pay less than the ball.' },
  ]}
  glance={[
    {
      heading: 'Your bet',
      items: [
        { name: 'Each ball', tag: 'one bet', text: 'Every ball is a bet of its own; drop as many as you like at once. The slot it lands in pays the bet times its multiplier.' },
        { name: 'Rows', tag: PLINKO_ROWS.join(' · '), text: 'More rows: the edges are rarer and pay more.' },
        { name: 'Risk', tag: PLINKO_RISKS.join(' · '), text: 'Higher risk: bigger edges, and a middle that pays back less than the ball.' },
      ],
    },
    {
      heading: 'Prize Pins',
      note: 'About every 75 balls, on any board.',
      items: [
        { name: 'Lights', text: 'Every pin a ball touches lights up and stays lit. New lights fill the meter, the rare edge pins most.' },
        { name: 'Prize Pins', tag: `${PRIZE_BALLS} free balls`, text: 'A full meter turns every pin into a share of the Pin Pot; each free ball collects the pins it touches.' },
        { name: 'Pin Pot', tag: `${(PIN_SHARE * 100).toFixed(0)}% of each bet`, text: 'Whatever isn’t collected stays in the pot for next time.' },
      ],
    },
    {
      heading: 'Fever',
      note: `About 1 ball in ${Math.round(1 / FEVER_CHANCE)} drops golden.`,
      items: [
        { name: 'Golden ball', text: 'Lands and pays like any ball, then sets off Fever.' },
        { name: 'The ladder', tag: FEVER_LADDER.map((x) => `×${x}`).join(' '), text: `${FEVER_BALLS} free balls on the same board, one at a time. Each pays its slot times the next step of the ladder, so the last ball counts most.` },
        { name: 'What it pays', tag: `≈ ${feverAvg.toFixed(0)} bets`, text: 'On average, on this board. A late ball on a big edge can pay thousands.' },
      ],
    },
  ]}
>
  {#snippet goal()}
    Drop balls through the pegs and hope they stray to the edges.
  {/snippet}
  <details>
    <summary>The odds on this board</summary>
    <ul>
      <li>
        At every peg the ball goes left or right with an even chance, so it lands in each slot as often as the number of
        paths to it: the middle most, the edges least. With {game.rows} rows, an edge slot takes about 1 ball in
        {Math.round(1 / odds[0]!).toLocaleString('en-US')} on each side.
      </li>
      <li>
        <b>Fever.</b> About one ball in {Math.round(1 / FEVER_CHANCE)} drops golden. It lands and pays like any ball, then sets off
        Fever: {FEVER_BALLS} free balls on the same board, one at a time, each paying its slot times the next step of the ladder:
        {FEVER_LADDER.map((x) => `×${x}`).join(', ')}. A Fever pays about {feverAvg.toFixed(0)} bets on average, and the last ball
        on a big edge can pay thousands.
      </li>
      <li>
        This board pays back {(game.payback * 100).toFixed(2)}%, exactly: each slot's multiplier times its chance, added up, plus
        Fever's share, plus the Pin Pot's {(PIN_SHARE * 100).toFixed(0)}%. Every board is within a sixth of a percent of {(game.rtp * 100).toFixed(0)}%.
      </li>
      <li>
        <b>Prize Pins.</b> Every pin a ball touches lights up, and stays lit between visits. The light meter fills as new pins light,
        the rare ones near the edges most; full (about every 75 balls), it sets off Prize Pins: {PRIZE_BALLS} free balls drop
        through a board where every pin holds a share of the Pin Pot, the rarest the most, and each ball collects every pin it
        touches. Then the board goes dark and starts again.
      </li>
      <li>
        <b>The Pin Pot.</b> Every ball puts {(PIN_SHARE * 100).toFixed(0)}% of its bet in, and whatever Prize Pins doesn't
        collect stays in for next time, so the pot pays back everything that goes in. Each board (8, 12 or 16 rows) has its own
        lights and pot.
      </li>
      <li>Balls in flight are already bet; the board's rows and risk can change once they've all landed.</li>
    </ul>
  </details>
</RulesFrame>

<TableShell
  {seq}
  machine
  cabinet="plinko"
  title={['Lucky', 'Drop']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={onTap}
  replay={game.replaying
    ? {
        label: `${game.replaying.rows} rows, ${game.replaying.risk} risk${game.replaying.golden ? ' · the golden ball' : ''}`,
        result: game.replayDone ? `${label(game.replaying.x)}×${game.replaying.golden ? ' Fever' : ''} · +${formatMoney(new Decimal(game.replaying.bet).mul(game.replaying.x))}` : undefined,
        won: game.replaying.x > 1,
        done: game.replayDone,
        onClose: game.replayDone ? () => game.closeReplay() : undefined,
      }
    : null}
>
  {#snippet felt()}
    <div class="istage plinko-stage" class:fever={!!game.fever}>
      <!-- The board's settings, on the cabinet over it: they lock while balls are falling. -->
      <div class="options">
        <div class="isegmented" role="group" aria-label="Rows">
          <span class="k">Rows</span>
          {#each PLINKO_ROWS as r (r)}
            <button type="button" aria-pressed={game.rows === r} disabled={game.locked} onclick={() => game.setRows(r)}>{r}</button>
          {/each}
        </div>
        <div class="isegmented" role="group" aria-label="Risk">
          <span class="k">Risk</span>
          {#each PLINKO_RISKS as r (r)}
            <button type="button" aria-pressed={game.risk === r} disabled={game.locked} onclick={() => game.setRisk(r)}>{r}</button>
          {/each}
        </div>
        <!-- The light meter: lit pins fill it, the rare ones most; full, it sets off Prize Pins. -->
        <div class="lights" title="Every pin a ball touches lights up. Light enough of the board and Prize Pins drops {PRIZE_BALLS} free balls to collect the Pin Pot.">
          <span class="k">Lights</span>
          <span class="meter" role="meter" aria-label="Light meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(game.meter * 100)}>
            <span style:width="{game.meter * 100}%"></span>
          </span>
          <span class="k">Pin Pot</span>
          <b>{formatMoney(game.pot)}</b>
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
          <radialGradient id="feverg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.45" stop-color="#7ad8ff" />
            <stop offset="1" stop-color="#7a3ad0" />
          </radialGradient>
          <radialGradient id="litg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.5" stop-color="#7affd2" />
            <stop offset="1" stop-color="#1fb38a" />
          </radialGradient>
          <radialGradient id="ballg" cx="35%" cy="30%">
            <stop offset="0" stop-color="#fff6c8" />
            <stop offset="0.6" stop-color="#ff9ad9" />
            <stop offset="1" stop-color="#c2409c" />
          </radialGradient>
        </defs>
        {#each pegs as p, i (i)}
          {@const prize = game.prize}
          <circle
            class="peg"
            class:lit={!prize && game.lit.has(i)}
            class:prize={!!prize && !prize.taken.has(i)}
            class:taken={!!prize && prize.taken.has(i)}
            cx={p.x}
            cy={p.y}
            r={s * (prize && !prize.taken.has(i) ? 0.09 + 0.5 * Math.sqrt(game.shares[i]!) : 0.09)}
            fill={prize ? 'url(#goldg)' : game.lit.has(i) ? 'url(#litg)' : 'url(#peg)'}
          />
          {#if prize && named.has(i) && !prize.taken.has(i)}
            <text class="pinprize" x={p.x} y={p.y - s * 0.32} text-anchor="middle" font-size={Math.min(s * 0.3, 26)}>{formatMoney(prize.pot.mul(game.shares[i]!))}</text>
          {/if}
        {/each}
        {#if game.prize}
          {#each game.prize.pops as pop (pop.key)}
            {@const p = pegs[pop.pin]!}
            <text class="pinpop" x={p.x} y={p.y - s * 0.3} text-anchor="middle" font-size={Math.min(s * 0.34, 30)}>+{formatMoney(pop.won)}</text>
          {/each}
        {/if}
        {#each game.pays as x, k (k)}
          {@const hit = game.hits[k]}
          <g class="slot" transform="translate({slotX(k, game.rows, s)} {slotY})">
            {#key hit?.key}
              <g class:bump={!!hit}>
                <rect x={-s * 0.46} y="0" width={s * 0.92} height={s * 0.62} rx={s * 0.12} fill={heat(k)} />
                <text y={s * 0.42} text-anchor="middle" font-size={Math.min(s * 0.36, 34)}>{label(x * boost)}{game.rows < 16 ? '×' : ''}</text>
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
          {@const r = (W / (ball.rows + 2)) * (ball.fever ? 0.36 : ball.golden ? 0.27 : ball.prize !== undefined ? 0.26 : 0.22)}
          <g use:fall={ball}>
            <circle
              {r}
              fill={ball.fever ? 'url(#feverg)' : ball.golden || ball.prize !== undefined ? 'url(#goldg)' : 'url(#ballg)'}
              class="ball"
              class:golden={ball.golden || ball.prize !== undefined}
              class:feverball={ball.fever}
            />
            {#if ball.fever}
              <text class="ballx" text-anchor="middle" dominant-baseline="central" font-size={r * 0.9}>×{ball.boost}</text>
            {/if}
          </g>
        {/each}
      </svg>

      {#if game.fever}
        {@const f = game.fever}
        <!-- Fever: the ladder climbing ball by ball, and what it has paid so far. -->
        <div class="fever-banner" class:done={f.done} aria-live="polite">
          {#if f.done}
            {#key f.done}
              <span class="k">Fever paid</span>
              <b class="total">{formatMoney(f.bet.mul(game.feverTotal))}</b>
              <span>{game.feverTotal.toFixed(1)}× your bet</span>
            {/key}
          {:else}
            <b>Fever!</b>
            <ol class="ladder-steps">
              {#each FEVER_LADDER as x, i (i)}
                <li class:now={i === f.step} class:past={i < f.pays.length - 1}>×{x}</li>
              {/each}
            </ol>
            <span>{formatMoney(f.bet.mul(game.feverTotal))} so far</span>
          {/if}
        </div>
      {/if}

      {#if game.prize}
        {@const p = game.prize}
        <!-- Prize Pins: the free balls collecting the pot, and what they've collected so far. -->
        <div class="fever-banner prize-banner" class:done={p.done} aria-live="polite">
          {#if p.done}
            <span class="k">Prize Pins paid</span>
            <b class="total">{formatMoney(p.total)}</b>
            <span>{p.taken.size} pins · the rest stays in the pot</span>
          {:else}
            <b>Prize Pins!</b>
            <span>Ball {Math.min(p.step + 1, p.balls.length)} of {p.balls.length} · {formatMoney(p.total)} of {formatMoney(p.pot)}</span>
          {/if}
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
    <div class="ibar">
      <BetPicker {game} />
      <button type="button" class="go primary" disabled={!game.canBet || game.autoPlay || !!game.fever} onclick={() => game.drop()}>
        {game.fever ? 'Fever!' : 'Drop ball'}
      </button>
      <span class="note">
        {game.fever ? (game.fever.done ? 'Fever is over: the board opens again in a moment' : 'Fever: the free balls are falling') : game.balls.length ? `${game.balls.length} in play · the board can change once they land` : 'Space drops a ball · 1 in ' + Math.round(1 / FEVER_CHANCE) + ' drops golden'}
      </span>
    </div>
  {/snippet}

  {#snippet panels()}
    <TablePanels
      {seq}
      autoPlay={game.autoPlay}
      onAuto={(on) => game.setAutoPlay(on)}
      seed={game.lastReplay ? game.lastReplay.run.slice(0, 12) : '—'}
      round={game.lastReplay?.round ?? 0}
      last={game.last}
      lastUnit={game.lastBet}
      stats={game.stats('Balls')}
      sessionNet={game.sessionNet}
      history={game.history}
      replay={{ data: game.lastReplay, play: (d) => game.replay(d as PlinkoReplay), busy: game.locked }}
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
        <p class="note">
          Pays back {(game.payback * 100).toFixed(2)}%: the slots and Fever {(game.slotPayback * 100).toFixed(2)}%, and the Pin Pot
          {(PIN_SHARE * 100).toFixed(0)}%. A golden ball's Fever drops {FEVER_BALLS} free balls at
          {FEVER_LADDER.map((x) => `×${x}`).join(', ')}: about {formatMoney(game.bet.mul(feverAvg))} on average.
        </p>
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
    transition: r 0.3s ease;
  }
  .peg.lit {
    filter: drop-shadow(0 0 6px #7affd2) drop-shadow(0 0 12px rgb(122 255 210 / 0.6));
    animation: light 0.5s ease-out;
  }
  @keyframes light {
    from {
      filter: drop-shadow(0 0 16px #fff) drop-shadow(0 0 24px #7affd2);
    }
  }
  .peg.prize {
    filter: drop-shadow(0 0 8px #ffd75e);
    animation: gleam 0.7s ease-in-out infinite alternate;
  }
  .peg.taken {
    opacity: 0.25;
  }
  .pinprize {
    font-family: var(--font-display);
    font-weight: 700;
    fill: #ffe9a8;
    paint-order: stroke;
    stroke: #1a0a2e;
    stroke-width: 4px;
    pointer-events: none;
  }
  .pinpop {
    font-family: var(--font-display);
    font-weight: 700;
    fill: #7affd2;
    paint-order: stroke;
    stroke: #1a0a2e;
    stroke-width: 4px;
    pointer-events: none;
    animation: rise 1.2s ease-out forwards;
  }
  @keyframes rise {
    to {
      translate: 0 -40px;
      opacity: 0;
    }
  }
  .lights {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.35);
    font: 12px/1 var(--font-ui);
  }
  .lights .k {
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lights b {
    color: #ffe9a8;
    font: 700 14px/1 var(--font-display);
  }
  .meter {
    position: relative;
    width: 110px;
    height: 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
  }
  .meter span {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #1fb38a, #7affd2);
    box-shadow: 0 0 10px #7affd2;
    transition: width 0.3s ease;
  }
  .prize-banner {
    box-shadow:
      inset 0 0 0 2px #7affd2,
      0 0 30px rgb(122 255 210 / 0.5);
  }
  .ball {
    filter: drop-shadow(0 0 8px #ff7ad9);
  }
  .ball.golden {
    filter: drop-shadow(0 0 10px #ffd75e) drop-shadow(0 0 22px rgb(255 215 94 / 0.8));
    animation: gleam 0.5s ease-in-out infinite alternate;
  }
  .ball.feverball {
    filter: drop-shadow(0 0 12px #7ad8ff) drop-shadow(0 0 24px rgb(194 123 255 / 0.9));
    animation: throb 0.35s ease-in-out infinite alternate;
  }
  @keyframes throb {
    to {
      filter: drop-shadow(0 0 18px #fff) drop-shadow(0 0 30px rgb(122 216 255 / 0.9));
    }
  }
  .ballx {
    font-family: var(--font-display);
    font-weight: 700;
    fill: #1a0a2e;
    pointer-events: none;
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
  .ladder-steps {
    display: flex;
    gap: 5px;
    margin: 2px 0;
    padding: 0;
    list-style: none;
  }
  .ladder-steps li {
    padding: 4px 9px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    font: 700 14px/1 var(--font-display);
    color: rgb(246 227 255 / 0.5);
  }
  .ladder-steps li.past {
    background: rgb(122 216 255 / 0.25);
    color: #bfe9ff;
  }
  .ladder-steps li.now {
    background: linear-gradient(135deg, #7ad8ff, #c27bff);
    color: #1a0a2e;
    box-shadow: 0 0 14px rgb(122 216 255 / 0.8);
    animation: throb-chip 0.5s ease-in-out infinite alternate;
  }
  @keyframes throb-chip {
    to {
      scale: 1.12;
    }
  }
  /* Fever's total: a big win, held up before the board opens again. */
  .fever-banner.done {
    top: 30%;
    padding: 18px 34px;
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 60px rgb(255 215 94 / 0.6);
  }
  .fever-banner .k {
    font: 700 12px/1 var(--font-ui);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #ffd75e;
  }
  .fever-banner .total {
    font-size: 52px;
    animation: slam 0.5s cubic-bezier(0.2, 1.8, 0.4, 1);
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
