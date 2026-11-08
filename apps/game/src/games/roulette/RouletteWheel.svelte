<script lang="ts">
  import { untrack } from 'svelte';
  import { pocketColor, ROULETTE_WHEEL } from '@idlesuits/sim';

  interface Props {
    /** Where the ball will land (or has landed). */
    pocket: number | null;
    /** Goes up by one for every spin, starting the animation afresh. */
    spins: number;
    /** How long the ball runs before it drops, in real milliseconds. */
    duration: number;
    /** The ball is still running. */
    spinning: boolean;
  }

  let { pocket, spins, duration, spinning }: Props = $props();

  const N = ROULETTE_WHEEL.length;
  const STEP = 360 / N;
  /** Pocket ring: from R_IN to R_OUT, numbers at R_TEXT; the ball runs at R_TRACK and settles at R_REST. */
  const R_OUT = 88;
  const R_IN = 64;
  const R_TEXT = 79;
  const R_TRACK = 95;
  const R_REST = 70;

  function point(r: number, deg: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  /** A pocket's wedge, centred at `deg`. */
  function wedge(deg: number): string {
    const [a, b] = [deg - STEP / 2, deg + STEP / 2];
    const [x1, y1] = point(R_OUT, a);
    const [x2, y2] = point(R_OUT, b);
    const [x3, y3] = point(R_IN, b);
    const [x4, y4] = point(R_IN, a);
    return `M${x1} ${y1} A${R_OUT} ${R_OUT} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${R_IN} ${R_IN} 0 0 0 ${x4} ${y4} Z`;
  }
  const FILL = { green: '#1d8a4e', red: '#c62a36', black: '#16161c' } as const;

  let wheel: SVGGElement;
  let orbit: SVGGElement;
  let ball: SVGCircleElement;
  /** Where the wheel and ball were left, so the next spin carries on from there. */
  let wheelAt = 0;
  let ballAt = 0;

  $effect(() => {
    // Only a new spin starts the animation; a speed change mid-spin leaves it running.
    const key = spins;
    const [target, length] = untrack(() => [pocket, duration] as const);
    if (!key || target === null || !wheel) return;
    const index = ROULETTE_WHEEL.indexOf(target as (typeof ROULETTE_WHEEL)[number]);
    // The wheel turns clockwise a couple of times; the ball runs the other way and drops into the pocket as it passes.
    const wheelTo = wheelAt + 360 * 2 + 40;
    const ballTo = wheelTo + index * STEP;
    const ballFrom = ballTo + 360 * 5 + ((((ballAt - ballTo) % 360) + 360) % 360);
    const ms = Math.max(400, length);
    const ease = 'cubic-bezier(0.15, 0.6, 0.25, 1)';
    const w = wheel.animate([{ transform: `rotate(${wheelAt}deg)` }, { transform: `rotate(${wheelTo}deg)` }], {
      duration: ms,
      easing: 'cubic-bezier(0.2, 0.5, 0.3, 1)',
      fill: 'forwards',
    });
    const o = orbit.animate([{ transform: `rotate(${ballFrom}deg)` }, { transform: `rotate(${ballTo}deg)` }], { duration: ms, easing: ease, fill: 'forwards' });
    // Off the track and into the pockets late in the run, with a bounce or two on the frets.
    const b = ball.animate(
      [
        { transform: `translateY(${-R_TRACK}px)`, offset: 0 },
        { transform: `translateY(${-R_TRACK}px)`, offset: 0.72 },
        { transform: `translateY(${-R_REST + 3}px)`, offset: 0.84 },
        { transform: `translateY(${-R_REST - 6}px)`, offset: 0.9 },
        { transform: `translateY(${-R_REST + 1}px)`, offset: 0.96 },
        { transform: `translateY(${-R_REST}px)`, offset: 1 },
      ],
      { duration: ms, easing: 'ease-in', fill: 'forwards' },
    );
    wheelAt = wheelTo % 360;
    ballAt = ballTo % 360;
    // Afterwards the ball rides round with the wheel in its pocket: both rest on their final angles.
    return () => {
      w.commitStyles?.();
      o.commitStyles?.();
      b.commitStyles?.();
      w.cancel();
      o.cancel();
      b.cancel();
    };
  });
</script>

<svg class="wheel" class:spinning viewBox="-100 -100 200 200" role="img" aria-label={pocket === null ? 'Roulette wheel' : `Roulette wheel, ball on ${pocket}`}>
  <defs>
    <radialGradient id="rw-wood" cx="50%" cy="45%" r="60%">
      <stop offset="0.7" stop-color="#5b3416" />
      <stop offset="1" stop-color="#2a170a" />
    </radialGradient>
    <radialGradient id="rw-cone" cx="45%" cy="40%">
      <stop offset="0" stop-color="#f6d98a" />
      <stop offset="0.45" stop-color="#b8862e" />
      <stop offset="1" stop-color="#5e3d12" />
    </radialGradient>
    <radialGradient id="rw-ball" cx="35%" cy="30%">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="#c8ccd6" />
    </radialGradient>
  </defs>
  <!-- The bowl and its ball track, fixed. -->
  <circle r="99" fill="url(#rw-wood)" />
  <circle r={R_TRACK + 3.5} fill="#1a0e06" />
  <circle r={R_TRACK + 3.5} fill="none" stroke="#c99a46" stroke-width="1.2" />
  <!-- The wheel head, which turns. -->
  <g bind:this={wheel} class="head">
    <circle r={R_OUT + 1} fill="#c99a46" />
    {#each ROULETTE_WHEEL as n, i (n)}
      {@const deg = i * STEP}
      <path d={wedge(deg)} fill={FILL[pocketColor(n)]} stroke="#d8b46a" stroke-width="0.6" />
      <text
        class="num"
        class:won={!spinning && pocket === n}
        transform="rotate({deg}) translate(0 {-R_TEXT})"
        text-anchor="middle"
        dominant-baseline="central">{n}</text
      >
    {/each}
    <circle r={R_IN} fill="#3a2210" stroke="#c99a46" stroke-width="1" />
    <circle r={R_IN - 6} fill="url(#rw-cone)" />
    <!-- The turret, its spokes and knob. -->
    {#each [0, 90, 180, 270] as a (a)}
      <rect x="-2.2" y="-38" width="4.4" height="30" rx="2" fill="#e8c77a" transform="rotate({a})" />
    {/each}
    <circle r="11" fill="#e8c77a" stroke="#7a521a" stroke-width="1.5" />
    <circle r="4.5" fill="#fff4cf" />
  </g>
  <!-- The ball: runs round the track, then drops into its pocket. -->
  <g bind:this={orbit}>
    <circle bind:this={ball} class="ball" r="4.4" fill="url(#rw-ball)" style:transform="translateY({-R_TRACK}px)" />
  </g>
</svg>

<style>
  .wheel {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 10px 18px rgb(0 0 0 / 0.55));
  }
  .head,
  g {
    transform-origin: 0 0;
  }
  .num {
    font: 700 7.4px/1 var(--font-ui);
    fill: #f6efe2;
  }
  .num.won {
    fill: #ffd75e;
    font-size: 9px;
  }
  .ball {
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.6));
  }
</style>
