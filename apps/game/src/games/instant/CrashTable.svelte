<script lang="ts">
  import { onDestroy } from 'svelte';
  import { crashChance, crashLineRtp, CRASH_CAP, GOLD_CHANCE, GOLD_X } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { CrashGame, MIN_REEL } from './crash.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new CrashGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  /** The water: the surface this far down the world, and each doubling of the multiplier this much deeper. */
  const SURFACE = 76;
  const PER_DOUBLE = 150;
  const depthOf = (x: number) => SURFACE + 34 + Math.log2(Math.max(1, x)) * PER_DOUBLE;
  const WORLD = depthOf(CRASH_CAP) + 220;
  /** Marks on the depth gauge. */
  const MARKS = [1.5, 2, 3, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  /** The marker's steps: off, then the usual targets. */
  const MARKER_STEPS = [0, 1.2, 1.5, 2, 3, 5, 10, 20, 50, 100, 250, 1000];

  /** The viewport's height, to keep the hook in view as it sinks. */
  let viewH = $state(500);
  /** After a line ends, a moment to see how, then the reel winds it back up to the boat. */
  let surfaced = $state(true);
  $effect(() => {
    const phase = game.phase;
    if (phase === 'sinking') {
      surfaced = false;
      return;
    }
    if (phase === 'idle') return;
    const t = setTimeout(() => (surfaced = true), 1500);
    return () => clearTimeout(t);
  });
  const hookY = $derived(surfaced ? depthOf(1) : depthOf(game.m));
  const offset = $derived(Math.max(0, hookY - viewH * 0.55));
  /** The line's own payback, golden lines aside: what the chances below come from. */
  const lineRtp = $derived(crashLineRtp(game.rtp));
  /** What bit through the line: something bigger the deeper it went. */
  const beast = $derived((game.result?.at ?? 1) >= 100 ? 'kraken' : (game.result?.at ?? 1) >= 10 ? 'eel' : 'shark');

  /** A marker typed in: anything from 1.01× up, or blank for none. */
  function typeMarker(e: Event) {
    const v = parseFloat((e.currentTarget as HTMLInputElement).value);
    game.setMarker(Number.isFinite(v) ? v : 0);
  }

  /**
   * The fish: a fixed school at every depth, bigger and stranger the deeper
   * they swim. `x` is a phase, `s` a size, `dir` which way it swims.
   */
  const KINDS = [
    { at: 1, color: '#ffd75e', fin: '#e8a01e', size: 22 },
    { at: 2, color: '#7ad8ff', fin: '#2f8fcf', size: 26 },
    { at: 5, color: '#ff8a5c', fin: '#c24a2a', size: 32 },
    { at: 20, color: '#c27bff', fin: '#7a3ad0', size: 40 },
    { at: 100, color: '#5fe0c4', fin: '#1f8a7a', size: 50, glow: true },
    { at: 1000, color: '#ff7ad9', fin: '#a82a86', size: 64, glow: true },
  ];
  const school = Array.from({ length: 34 }, (_, i) => {
    let x = i * 7919 + 13;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const depth = 1.2 * 2 ** (r() * 13.4);
    const kind = [...KINDS].reverse().find((k) => depth >= k.at) ?? KINDS[0]!;
    return { y: depthOf(depth) + (r() - 0.5) * 60, phase: r(), speed: 9 + r() * 14, dir: r() < 0.5 ? 1 : -1, ...kind, size: kind.size * (0.8 + r() * 0.5) };
  });

  /** The fish on the hook when a line is landed: the kind that swims at that depth. */
  const caught = $derived(game.phase === 'landed' && game.result ? ([...KINDS].reverse().find((k) => game.result!.at >= k.at) ?? KINDS[0]!) : null);

  const markerIndex = $derived(Math.max(0, MARKER_STEPS.findIndex((x) => x >= game.marker)));
  function stepMarker(d: number) {
    const i = game.marker && !MARKER_STEPS.includes(game.marker) ? markerIndex - (d < 0 ? 0 : 1) : markerIndex;
    game.setMarker(MARKER_STEPS[Math.min(MARKER_STEPS.length - 1, Math.max(0, i + d))]!);
  }

  function onTap() {
    if (!game.started) return;
    if (game.sinking) game.reelIn();
    else if (!game.autoPlay) game.drop();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside, button')) return;
    if (e.key === 'ArrowUp' && !game.sinking) return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown' && !game.sinking) return game.setStep(game.step - 1);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    onTap();
  }

  function begin() {
    unlockAudio();
    game.start();
  }

  const tone = (x: number) => (x < 2 ? 'low' : x < 10 ? 'mid' : 'high');
  const fmtX = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(2));
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Drop the line', demo: '⚓', text: 'Stake your bet and the hook sinks. The deeper it goes, the higher the multiplier climbs.' },
    { title: 'Reel in', demo: '2.40×', text: 'Reel in any time to win your bet times the multiplier, or set a marker and the reel does it there.' },
    { title: 'Don’t wait too long', demo: '✂', text: 'Somewhere down there something bites through the line. Snap, and the bet is lost.' },
  ]}
>
  {#snippet goal()}
    Reel your line in before something in the deep bites through it.
  {/snippet}
  <details open>
    <summary>Where the line snaps</summary>
    <ul>
      <li>Each line's snapping point is drawn as it drops, from the round's seed, and never changes. Nobody's reel-in moves it.</li>
      <li>
        The chance the line lasts to any multiplier is {(lineRtp * 100).toFixed(1)}% divided by that multiplier: to 2× about
        {(crashChance(lineRtp, 2) * 100).toFixed(1)}% of the time, to 10× about {(crashChance(lineRtp, 10) * 100).toFixed(1)}%, to
        100× about {(crashChance(lineRtp, 100) * 100).toFixed(2)}%.
      </li>
      <li>
        <b>Golden lines.</b> About one line in {Math.round(1 / GOLD_CHANCE)} drops with a gold hook, shown as it drops. Whatever it lands
        pays ×{GOLD_X}.
      </li>
      <li>
        So it pays back {(game.rtp * 100).toFixed(1)}%, golden lines included, wherever you reel in. The house's cut is the lines that
        snap at once, before {MIN_REEL.toFixed(2)}×: about {((1 - lineRtp / MIN_REEL) * 100).toFixed(1)}% of them.
      </li>
      <li>The deepest any line goes is {CRASH_CAP.toLocaleString('en-US')}×.</li>
    </ul>
  </details>
</RulesFrame>

<TableShell
  machine
  cabinet="deepdrop"
  title={['Deep', 'Drop']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={onTap}
>
  {#snippet felt()}
    <div
      class="sea"
      bind:clientHeight={viewH}
      class:snapped={game.phase === 'snapped' && !surfaced}
      class:landed={game.phase === 'landed'}
      class:reeling={surfaced && game.phase !== 'sinking'}
      class:golden={game.golden && game.phase !== 'idle'}
    >
      <div class="world" style:height="{WORLD}px" style:transform="translateY({-offset}px)">
        <!-- Above: the sky and the boat. -->
        <div class="sky" style:height="{SURFACE}px">
          <i class="sun"></i>
          <svg class="boat" viewBox="0 0 120 50" aria-hidden="true">
            <path d="M8 30h104l-14 16H22z" fill="#8a4a24" stroke="#2b1709" stroke-width="2.5" stroke-linejoin="round" />
            <path d="M30 30V14h26v16" fill="#f4ede0" stroke="#2b1709" stroke-width="2.5" stroke-linejoin="round" />
            <path d="M60 30L96 4" stroke="#2b1709" stroke-width="3" stroke-linecap="round" />
            <circle cx="42" cy="22" r="3" fill="#7ad8ff" stroke="#2b1709" stroke-width="1.5" />
          </svg>
        </div>
        <svg class="surface" style:top="{SURFACE - 8}px" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 8 Q12.5 0 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V16 H0 Z" />
        </svg>
        <!-- Sunlight in shafts down through the shallows. -->
        <div class="rays" style:top="{SURFACE}px" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

        <!-- The depth gauge, and the marker where the reel takes over. -->
        {#each MARKS as x (x)}
          <div class="mark" class:passed={game.m >= x} style:top="{depthOf(x)}px"><span>{fmtX(x)}×</span></div>
        {/each}
        {#if game.marker}
          <div class="marker" style:top="{depthOf(game.marker)}px"><span>Reel in {fmtX(game.marker)}×</span></div>
        {/if}

        <!-- The school: every depth has its fish, stranger the deeper. -->
        {#each school as f, i (i)}
          <svg
            class="fish"
            class:glow={f.glow}
            viewBox="0 0 60 30"
            style:top="{f.y}px"
            style:width="{f.size}px"
            style:--dur="{f.speed}s"
            style:--delay="{-f.phase * f.speed}s"
            style:--dir={f.dir}
            aria-hidden="true"
          >
            <path d="M8 15c8-12 30-12 38 0-8 12-30 12-38 0z" fill={f.color} stroke="#0a1a24" stroke-width="2" />
            <path d="M46 15l12-9v18z" fill={f.fin} stroke="#0a1a24" stroke-width="2" stroke-linejoin="round" />
            <circle cx="16" cy="13" r="2.4" fill="#0a1a24" />
          </svg>
        {/each}

        <!-- The line and the hook. -->
        <div class="line" style:top="{SURFACE - 22}px" style:height="{hookY - SURFACE + 22}px"></div>
        {#if game.sinking}
          <div class="bubbles" style:top="{hookY - 30}px" aria-hidden="true"><i></i><i></i><i></i></div>
        {/if}
        <svg class="hook" class:gone={game.phase === 'snapped' && surfaced} style:top="{hookY - 4}px" viewBox="0 0 40 60" aria-hidden="true">
          <path d="M20 2v34c0 10 14 10 14 0" fill="none" stroke={game.golden ? '#ffd75e' : '#d6dde6'} stroke-width="4" stroke-linecap="round" />
          <path d="M34 36l-5-6" stroke={game.golden ? '#ffd75e' : '#d6dde6'} stroke-width="4" stroke-linecap="round" />
          <circle cx="20" cy="4" r="4" fill="#ff5a5a" stroke="#4a0d0a" stroke-width="1.5" />
          {#if caught}
            <g transform="translate(6 34) rotate(80 14 10)">
              <path d="M2 10c6-9 22-9 28 0-6 9-22 9-28 0z" fill={caught.color} stroke="#0a1a24" stroke-width="2" />
              <path d="M30 10l8-6v12z" fill={caught.fin} stroke="#0a1a24" stroke-width="2" />
            </g>
          {/if}
        </svg>
        {#if game.phase === 'snapped' && game.result && game.result.at > 1 && !surfaced}
          <!-- Whatever bit through the line, gone again into the dark: bigger the deeper it was. -->
          {#if beast === 'shark'}
            <svg class="beast" style:top="{hookY - 70}px" viewBox="0 0 220 120" aria-hidden="true">
              <path d="M10 60c40-50 140-50 190-10l20-22-6 34 6 34-20-22c-50 40-150 40-190-14z" fill="#0b1a24" stroke="#2fc4b2" stroke-width="2" />
              <path d="M90 30l20-26 10 30" fill="#0b1a24" stroke="#2fc4b2" stroke-width="2" />
              <path d="M10 60l40 8-40 8" fill="#031018" />
              <path d="M16 58l6 6 6-6 6 6 6-6M16 74l6-6 6 6 6-6 6 6" fill="none" stroke="#e8f6ff" stroke-width="2" />
              <circle cx="62" cy="48" r="5" fill="#ff5a5a" />
            </svg>
          {:else if beast === 'eel'}
            <svg class="beast eel" style:top="{hookY - 60}px" viewBox="0 0 300 110" aria-hidden="true">
              <path d="M10 56c30-30 60-30 80 0s50 30 80 0 60-30 90 0c10 10 20 12 34 8-8 14-26 18-40 8-26-24-56-24-84 0s-56 28-84 4-50-26-76-4z" fill="#12261a" stroke="#8cf08a" stroke-width="2" />
              <circle cx="26" cy="52" r="4" fill="#fff3b0" />
              <path d="M10 56l14 6" stroke="#e8f6ff" stroke-width="2" />
            </svg>
          {:else}
            <svg class="beast kraken" style:top="{hookY - 110}px" viewBox="0 0 260 220" aria-hidden="true">
              <path d="M130 10c40 0 66 30 66 70 0 30-14 46-26 56H90c-12-10-26-26-26-56 0-40 26-70 66-70z" fill="#3a0d2c" stroke="#ff7ad9" stroke-width="2" />
              {#each [-80, -40, 0, 40, 80] as dx (dx)}
                <path d="M{130 + dx * 0.4} 136c{dx * 0.6} 30 {dx * 1.2} 40 {dx} 76" fill="none" stroke="#3a0d2c" stroke-width="14" stroke-linecap="round" />
                <path d="M{130 + dx * 0.4} 136c{dx * 0.6} 30 {dx * 1.2} 40 {dx} 76" fill="none" stroke="#ff7ad9" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round" />
              {/each}
              <circle cx="108" cy="80" r="10" fill="#fff3b0" /><circle cx="152" cy="80" r="10" fill="#fff3b0" />
              <circle cx="108" cy="82" r="4" fill="#120410" /><circle cx="152" cy="82" r="4" fill="#120410" />
            </svg>
          {/if}
        {/if}
      </div>

      <!-- Over the water: the multiplier, and the last lines. -->
      <div class="hud">
        <div class="recent" aria-label="Recent lines">
          {#each game.recent as x, i (i)}<span class={tone(x)}>{fmtX(x)}×</span>{/each}
        </div>
        <div class="mult {game.phase}" aria-live="polite">
          {#if game.phase === 'snapped'}
            <small>Snapped!</small>
            <b>{fmtX(game.result?.at ?? 1)}×</b>
          {:else if game.phase === 'landed'}
            <small>Landed at {fmtX(game.result?.at ?? 1)}×</small>
            <b>+{formatMoney(game.result?.pay ?? game.bet)}</b>
          {:else}
            <small>{game.sinking ? (game.golden ? `Golden line · pays ×${GOLD_X}` : 'Sinking') : 'Line up'}</small>
            <b>{fmtX(game.m)}×</b>
          {/if}
        </div>
      </div>

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Drop a line into the deep. The multiplier climbs as the hook sinks, until something down there bites through the line. Reel in before it does."
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
      {#if game.sinking}
        <button type="button" class="go primary reel" disabled={!game.reelPay} onclick={() => game.reelIn()}>
          {game.reelPay ? `Reel in ${formatMoney(game.reelPay)}` : 'Reel in'}
        </button>
        <span class="note">{game.marker ? `The reel takes over at ${fmtX(game.marker)}×` : 'No marker: reel in by hand'}</span>
      {:else}
        <BetPicker {game} />
        <div class="stepper" role="group" aria-label="Reel-in marker">
          <span class="k keep">Marker</span>
          <button type="button" aria-label="Lower marker" onclick={() => stepMarker(-1)} disabled={!game.marker}>−</button>
          <label class="typed">
            <input
              type="number"
              inputmode="decimal"
              min="1.01"
              max={CRASH_CAP}
              step="0.01"
              placeholder="Off"
              value={game.marker ? game.marker : ''}
              onchange={typeMarker}
              aria-label="Reel in at"
            /><span>×</span>
          </label>
          <button type="button" aria-label="Raise marker" onclick={() => stepMarker(1)} disabled={markerIndex >= MARKER_STEPS.length - 1}>+</button>
        </div>
        <button type="button" class="go primary" disabled={!game.canBet || game.autoPlay} onclick={() => game.drop()}>Drop line</button>
        <span class="note">
          {game.marker
            ? `Lands at ${fmtX(game.marker)}× ${(crashChance(lineRtp, game.marker) * 100).toFixed(game.marker >= 100 ? 2 : 1)}% of the time, for ${formatMoney(game.bet.mul(game.marker))} (×${GOLD_X} on a golden line)`
            : 'No marker: you reel in by hand'}
        </span>
      {/if}
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
      stats={game.stats('Lines')}
      sessionNet={game.sessionNet}
      history={game.history}
    >
      {#snippet automation()}
        <section class="panel ipanel">
          <p class="note">Auto play drops line after line and reels in at the marker ({game.marker ? `${fmtX(game.marker)}×` : 'set to 2× if off'}).</p>
        </section>
      {/snippet}
      <section class="panel ipanel">
        <h2>The odds <span>at a {formatMoney(game.bet)} bet</span></h2>
        <table class="ladder">
          <thead><tr><th>Reel in at</th><th>Pays</th><th>Lands</th></tr></thead>
          <tbody>
            {#each [1.5, 2, 3, 5, 10, 50, 100, 1000] as x (x)}
              <tr>
                <td>{fmtX(x)}×</td>
                <td>{formatMoney(game.bet.mul(x))}</td>
                <td>{(crashChance(lineRtp, x) * 100).toFixed(x >= 100 ? 2 : 1)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">Pays back {(game.rtp * 100).toFixed(1)}% wherever you reel in.</p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  .sea {
    position: relative;
    height: 100%;
    min-height: 260px;
    overflow: hidden;
    border-radius: inherit;
  }
  .world {
    position: absolute;
    inset: 0 0 auto;
    transition: transform 120ms linear;
    background: linear-gradient(
      #87c6e8 0,
      #bfe4f2 70px,
      #1f8fae 80px,
      #136a8a 300px,
      #0b4a66 700px,
      #062f45 1200px,
      #041c2c 1700px,
      #020b12 2400px
    );
  }
  .landed .world,
  .reeling .world {
    transition: transform 900ms cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  /* The reel winds the hook back up to the boat. */
  .reeling .hook,
  .reeling .line {
    transition:
      top 900ms cubic-bezier(0.3, 0.7, 0.3, 1),
      height 900ms cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  .hook.gone {
    opacity: 0;
  }
  .golden .hook {
    filter: drop-shadow(0 0 8px #ffd75e) drop-shadow(0 0 16px rgb(255 215 94 / 0.7));
  }
  .golden .line {
    background: linear-gradient(#fff3b0, #ffd75e);
    box-shadow: 0 0 6px rgb(255 215 94 / 0.8);
  }
  .golden .mult {
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 24px rgb(255 215 94 / 0.5);
  }
  .golden .mult b {
    color: #ffe9a8;
  }
  .rays {
    position: absolute;
    left: 0;
    right: 0;
    height: 420px;
    overflow: hidden;
    pointer-events: none;
  }
  .rays i {
    position: absolute;
    top: 0;
    width: 70px;
    height: 100%;
    background: linear-gradient(rgb(255 255 255 / 0.14), transparent);
    transform-origin: top;
    animation: ray 7s ease-in-out infinite alternate;
  }
  .rays i:nth-child(1) {
    left: 12%;
    rotate: 14deg;
  }
  .rays i:nth-child(2) {
    left: 34%;
    rotate: 8deg;
    animation-delay: -2s;
  }
  .rays i:nth-child(3) {
    left: 62%;
    rotate: -6deg;
    animation-delay: -4s;
  }
  .rays i:nth-child(4) {
    left: 84%;
    rotate: -12deg;
    animation-delay: -1s;
  }
  @keyframes ray {
    to {
      opacity: 0.4;
      translate: 20px 0;
    }
  }
  .bubbles {
    position: absolute;
    left: calc(50% + 14px);
    width: 20px;
    height: 30px;
    pointer-events: none;
  }
  .bubbles i {
    position: absolute;
    bottom: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid rgb(200 240 255 / 0.7);
    animation: bubble 1.2s ease-in infinite;
  }
  .bubbles i:nth-child(2) {
    left: 8px;
    animation-delay: -0.4s;
    scale: 0.7;
  }
  .bubbles i:nth-child(3) {
    left: 3px;
    animation-delay: -0.8s;
    scale: 0.5;
  }
  @keyframes bubble {
    to {
      translate: 4px -60px;
      opacity: 0;
    }
  }
  .beast.eel {
    width: 300px;
  }
  .beast.kraken {
    width: 260px;
    animation-name: rise-up;
  }
  @keyframes rise-up {
    0% {
      left: calc(50% - 130px);
      translate: 0 200px;
      opacity: 0;
    }
    40% {
      left: calc(50% - 130px);
      translate: 0 0;
      opacity: 1;
    }
    100% {
      left: calc(50% - 130px);
      translate: 0 260px;
      opacity: 0;
    }
  }
  .typed {
    display: inline-flex;
    align-items: baseline;
    gap: 1px;
  }
  .typed input {
    width: 64px;
    padding: 2px 0;
    border: 0;
    border-bottom: 1px dashed rgb(232 182 76 / 0.5);
    background: none;
    color: var(--gold);
    font: 700 18px/1 var(--font-display);
    text-align: right;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .typed input::-webkit-inner-spin-button,
  .typed input::-webkit-outer-spin-button {
    appearance: none;
  }
  .typed input::placeholder {
    color: var(--muted);
  }
  .typed span {
    font: 700 16px/1 var(--font-display);
    color: var(--gold);
  }
  .sky {
    position: absolute;
    inset: 0 0 auto;
  }
  .sun {
    position: absolute;
    right: 14%;
    top: 10px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff6c8, #ffd75e 60%, transparent 70%);
    box-shadow: 0 0 30px rgb(255 215 94 / 0.8);
  }
  .boat {
    position: absolute;
    left: calc(50% - 74px);
    bottom: -6px;
    width: 120px;
    animation: bob 3.2s ease-in-out infinite alternate;
  }
  @keyframes bob {
    to {
      translate: 0 3px;
      rotate: 1.5deg;
    }
  }
  .surface {
    position: absolute;
    left: 0;
    width: 100%;
    height: 16px;
    fill: #1f8fae;
  }
  .mark {
    position: absolute;
    right: 0;
    width: 64px;
    border-top: 1px dashed rgb(200 240 255 / 0.25);
    font: 600 11px/1 var(--font-ui);
    color: rgb(200 240 255 / 0.55);
    text-align: right;
  }
  .mark span {
    position: relative;
    top: -14px;
    right: 6px;
  }
  .mark.passed {
    border-top-color: rgb(95 224 196 / 0.6);
    color: #5fe0c4;
  }
  .marker {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 2px solid #ffd75e;
    box-shadow: 0 0 10px rgb(255 215 94 / 0.6);
  }
  .marker span {
    position: absolute;
    left: 10px;
    top: -22px;
    padding: 3px 8px;
    border-radius: 6px 6px 6px 0;
    background: #ffd75e;
    color: #3a2600;
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.04em;
  }
  /* Each fish crosses the water and comes round again; its head (drawn on the left) leads. */
  .fish {
    position: absolute;
    left: 0;
    height: auto;
    transform: scaleX(calc(var(--dir) * -1));
    animation: swim var(--dur) linear infinite;
    animation-delay: var(--delay);
    opacity: 0.85;
  }
  .fish[style*='--dir: -1'] {
    animation-direction: reverse;
  }
  .fish.glow {
    filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 6px #5fe0c4);
  }
  @keyframes swim {
    from {
      left: -12%;
    }
    to {
      left: 108%;
    }
  }
  .line {
    position: absolute;
    left: calc(50% + 21px);
    width: 1.5px;
    background: rgb(240 248 255 / 0.75);
  }
  .snapped .line {
    animation: recoil 700ms ease-in forwards;
    transform-origin: top;
  }
  @keyframes recoil {
    to {
      transform: scaleY(0.15);
      opacity: 0;
    }
  }
  .hook {
    position: absolute;
    left: calc(50% + 2px);
    width: 40px;
    filter: drop-shadow(0 0 6px rgb(255 255 255 / 0.4));
  }
  .snapped .hook {
    animation: taken 500ms ease-in forwards;
  }
  @keyframes taken {
    to {
      translate: -120px 30px;
      opacity: 0;
    }
  }
  .beast {
    position: absolute;
    left: -10%;
    width: 220px;
    animation: lunge 900ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
    filter: drop-shadow(0 0 14px rgb(47 196 178 / 0.5));
  }
  @keyframes lunge {
    0% {
      left: -40%;
      opacity: 0;
    }
    35% {
      left: calc(50% - 40px);
      opacity: 1;
    }
    100% {
      left: -50%;
      opacity: 0;
    }
  }
  /* Over the water, clear of the boat and the line: the last lines, and the multiplier under them. */
  .hud {
    position: absolute;
    inset: 0 auto auto 0;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 8px;
    max-width: 44%;
    padding: 10px 12px;
    pointer-events: none;
  }
  .recent {
    display: flex;
    flex-wrap: wrap;
    justify-content: start;
    gap: 4px;
    max-width: 100%;
  }
  .recent span {
    padding: 3px 7px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.45);
    font: 700 11px/1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .recent .low {
    color: #ff9a8a;
  }
  .recent .mid {
    color: #5fe0c4;
  }
  .recent .high {
    color: #ffd75e;
  }
  .mult {
    display: grid;
    justify-items: center;
    gap: 2px;
    margin-top: 4px;
    padding: 10px 24px;
    border-radius: 16px;
    background: rgb(2 16 26 / 0.55);
    backdrop-filter: blur(2px);
  }
  .mult small {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #bfe4f2;
  }
  .mult b {
    font: 700 clamp(36px, 8cqw, 64px) / 1 var(--font-display);
    color: #fff;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 18px rgb(95 224 196 / 0.6);
  }
  .mult.snapped b {
    color: #ff6b5a;
    text-shadow: 0 0 18px rgb(255 90 90 / 0.6);
    animation: jolt 400ms ease;
  }
  .mult.landed b {
    color: #8cf08a;
    text-shadow: 0 0 18px rgb(140 240 138 / 0.6);
  }
  @keyframes jolt {
    30% {
      translate: -8px 0;
    }
    60% {
      translate: 6px 0;
    }
  }
  .reel {
    min-width: 240px !important;
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
