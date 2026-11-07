<script lang="ts">
  /**
   * What moves behind each machine, all the time, to set its scene: gold
   * glints in the vault, embers rising off the forge, bubbles and a swell under
   * the pirates, spotlights and confetti in the big top, lanterns drifting up
   * into the festival night. `hot` speeds it all up during a bonus.
   */
  interface Props {
    id: string;
    hot?: boolean;
  }

  let { id, hot = false }: Props = $props();

  /** A fixed scatter of points, so the scene is the same every visit. */
  function scatter(n: number, seed: number) {
    let x = seed;
    const next = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => ({ x: next() * 100, y: next() * 100, d: next(), s: next() }));
  }
  const COUNT: Record<string, number> = { vault: 22, forge: 26, haul: 18, carnival: 26, lanterns: 14 };
  const bits = $derived(scatter(COUNT[id] ?? 0, id.length * 131 + 7));
  const CONFETTI = ['#ffd75e', '#e8344f', '#4cc9b0', '#7ad8ff', '#d08cff', '#fff4d6'];
</script>

<div class="scene {id}" class:hot aria-hidden="true">
  {#if id === 'vault'}
    <span class="sweep"></span>
    {#each bits as b, i (i)}<i class="glint" style:left="{b.x}%" style:top="{b.y}%" style:--d={b.d} style:--s={b.s}></i>{/each}
  {:else if id === 'forge'}
    <span class="heat"></span>
    {#each bits as b, i (i)}<i class="ember" style:left="{b.x}%" style:--d={b.d} style:--s={b.s}></i>{/each}
  {:else if id === 'haul'}
    <span class="caustics"></span>
    {#each bits as b, i (i)}<i class="bubble" style:left="{b.x}%" style:--d={b.d} style:--s={b.s}></i>{/each}
    <svg class="swell back" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z" /></svg>
    <svg class="swell" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z" /></svg>
  {:else if id === 'carnival'}
    <span class="beam l"></span>
    <span class="beam r"></span>
    {#each bits as b, i (i)}<i class="confetti" style:left="{b.x}%" style:--d={b.d} style:--s={b.s} style:--c={CONFETTI[i % CONFETTI.length]}></i>{/each}
  {:else if id === 'lanterns'}
    {#each scatter(30, 3) as b, i (i)}<i class="star" style:left="{b.x}%" style:top="{b.y * 0.7}%" style:--d={b.d}></i>{/each}
    {#each bits as b, i (i)}<i class="float" style:left="{b.x}%" style:--d={b.d} style:--s={b.s}></i>{/each}
  {/if}
</div>

<style>
  .scene {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
    z-index: 0;
  }
  i,
  span,
  svg {
    position: absolute;
  }

  /* The vault: a slow sweep of light, and gold glinting here and there. */
  .sweep {
    inset: -20% -60%;
    background: linear-gradient(100deg, transparent 42%, rgb(255 230 160 / 0.07) 50%, transparent 58%);
    animation: sweep 7s ease-in-out infinite;
  }
  @keyframes sweep {
    from {
      translate: -40% 0;
    }
    to {
      translate: 40% 0;
    }
  }
  .glint {
    width: 10px;
    height: 10px;
    background:
      linear-gradient(transparent 45%, #ffe9a8 45% 55%, transparent 55%),
      linear-gradient(90deg, transparent 45%, #ffe9a8 45% 55%, transparent 55%);
    filter: drop-shadow(0 0 4px #f2c64e);
    scale: calc(0.4 + var(--s) * 0.8);
    opacity: 0;
    animation: glint calc(3s + var(--d) * 4s) ease-in-out infinite;
    animation-delay: calc(var(--d) * -7s);
  }
  @keyframes glint {
    0%,
    80%,
    100% {
      opacity: 0;
      rotate: 0deg;
    }
    90% {
      opacity: 0.9;
      rotate: 45deg;
    }
  }

  /* The forge: a glow from below, and embers drifting up through it. */
  .heat {
    inset: auto -10% -30% -10%;
    height: 70%;
    background: radial-gradient(ellipse at 50% 100%, rgb(255 110 30 / 0.35), rgb(255 60 10 / 0.12) 45%, transparent 70%);
    animation: heat 3s ease-in-out infinite alternate;
  }
  @keyframes heat {
    to {
      opacity: 0.6;
      scale: 1.05 0.95;
    }
  }
  .ember {
    bottom: -8px;
    width: calc(2px + var(--s) * 4px);
    height: calc(2px + var(--s) * 4px);
    border-radius: 50%;
    background: #ffcf6b;
    box-shadow:
      0 0 6px #ff8a2a,
      0 0 12px #ff5a1f;
    animation: rise calc(5s + var(--d) * 6s) linear infinite;
    animation-delay: calc(var(--d) * -11s);
  }
  @keyframes rise {
    0% {
      transform: translate(0, 0);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    100% {
      transform: translate(calc((var(--s) - 0.5) * 120px), -110cqh);
      opacity: 0;
    }
  }

  /* The pirates: light rippling down through the water, bubbles, and the swell along the bottom. */
  .caustics {
    inset: 0;
    background:
      radial-gradient(ellipse 30% 12% at 20% 10%, rgb(120 255 230 / 0.08), transparent),
      radial-gradient(ellipse 25% 10% at 70% 18%, rgb(120 255 230 / 0.07), transparent),
      radial-gradient(ellipse 35% 14% at 45% 4%, rgb(120 255 230 / 0.09), transparent);
    animation: ripple 6s ease-in-out infinite alternate;
  }
  @keyframes ripple {
    to {
      translate: 6% 3%;
      opacity: 0.6;
    }
  }
  .bubble {
    bottom: -10px;
    width: calc(4px + var(--s) * 8px);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1px solid rgb(160 255 235 / 0.45);
    background: radial-gradient(circle at 35% 35%, rgb(255 255 255 / 0.5), transparent 45%);
    animation: bubble calc(6s + var(--d) * 6s) ease-in infinite;
    animation-delay: calc(var(--d) * -12s);
  }
  @keyframes bubble {
    0% {
      transform: translate(0, 0);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    50% {
      transform: translate(10px, -55cqh);
    }
    100% {
      transform: translate(-6px, -110cqh);
      opacity: 0;
    }
  }
  .swell {
    left: 0;
    bottom: 0;
    width: 200%;
    height: 34px;
    fill: rgb(30 140 130 / 0.35);
    animation: swell 9s linear infinite;
  }
  .swell.back {
    bottom: 8px;
    fill: rgb(30 140 130 / 0.18);
    animation-duration: 14s;
    animation-direction: reverse;
  }
  @keyframes swell {
    to {
      translate: -50% 0;
    }
  }

  /* The big top: two spotlights crossing, and confetti drifting down. */
  .beam {
    top: -10%;
    width: 38%;
    height: 130%;
    background: linear-gradient(rgb(255 244 214 / 0.16), transparent 80%);
    clip-path: polygon(45% 0, 55% 0, 100% 100%, 0 100%);
    transform-origin: 50% 0;
    animation: beam 6s ease-in-out infinite alternate;
  }
  .beam.l {
    left: 4%;
    rotate: -25deg;
  }
  .beam.r {
    right: 4%;
    rotate: 25deg;
    animation-delay: -3s;
  }
  @keyframes beam {
    from {
      transform: rotate(-18deg);
    }
    to {
      transform: rotate(18deg);
    }
  }
  .confetti {
    top: -12px;
    width: 6px;
    height: 10px;
    border-radius: 1px;
    background: var(--c);
    opacity: 0.7;
    animation: fall calc(7s + var(--d) * 7s) linear infinite;
    animation-delay: calc(var(--d) * -14s);
  }
  @keyframes fall {
    0% {
      transform: translate(0, 0) rotate(0deg) rotateX(0deg);
    }
    100% {
      transform: translate(calc((var(--s) - 0.5) * 140px), 110cqh) rotate(540deg) rotateX(720deg);
    }
  }

  /* The festival night: stars, and paper lanterns rising slowly. */
  .star {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: #fff;
    animation: twinkle calc(2s + var(--d) * 3s) ease-in-out infinite alternate;
    animation-delay: calc(var(--d) * -5s);
  }
  @keyframes twinkle {
    from {
      opacity: 0.15;
    }
    to {
      opacity: 0.9;
    }
  }
  .float {
    bottom: -30px;
    width: calc(8px + var(--s) * 10px);
    aspect-ratio: 0.75;
    border-radius: 40%;
    background: radial-gradient(circle at 50% 45%, #ffe2a0, #ff7a3a 55%, #b8222f);
    box-shadow: 0 0 16px rgb(255 140 60 / 0.7);
    opacity: 0.75;
    animation: drift calc(14s + var(--d) * 12s) linear infinite;
    animation-delay: calc(var(--d) * -26s);
  }
  @keyframes drift {
    0% {
      transform: translate(0, 0);
      opacity: 0;
    }
    10% {
      opacity: 0.8;
    }
    50% {
      transform: translate(18px, -60cqh);
    }
    100% {
      transform: translate(-10px, -120cqh);
      opacity: 0;
    }
  }

  /* In a bonus, everything moves faster. */
  .hot i {
    animation-duration: 2.2s;
  }
  .hot.lanterns i.float {
    animation-duration: 6s;
  }
  .hot .beam {
    animation-duration: 1.6s;
  }
  @media (prefers-reduced-motion: reduce) {
    i,
    span,
    svg {
      animation: none !important;
    }
  }
</style>
