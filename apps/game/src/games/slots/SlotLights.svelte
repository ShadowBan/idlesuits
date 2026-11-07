<script lang="ts">
  /**
   * The bulbs round the reels, as on a real cabinet. They chase slowly while
   * the machine waits, race while the reels spin, flash together on a win,
   * cycle colour through a bonus and strobe for a big win. Their colours come
   * from the cabinet: `--bulb-a` and `--bulb-b`, alternating.
   */
  export type LightMode = 'idle' | 'spin' | 'win' | 'bonus' | 'party';

  interface Props {
    mode: LightMode;
    /** Bulbs along the top and bottom edges, and down each side. */
    across?: number;
    down?: number;
  }

  let { mode, across = 18, down = 9 }: Props = $props();

  /** Every bulb's place round the frame, clockwise from the top left, in percent. */
  const bulbs = $derived.by(() => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < across; i++) out.push({ x: ((i + 0.5) / across) * 100, y: 0 });
    for (let i = 0; i < down; i++) out.push({ x: 100, y: ((i + 0.5) / down) * 100 });
    for (let i = across - 1; i >= 0; i--) out.push({ x: ((i + 0.5) / across) * 100, y: 100 });
    for (let i = down - 1; i >= 0; i--) out.push({ x: 0, y: ((i + 0.5) / down) * 100 });
    return out;
  });
</script>

<div class="lights {mode}" aria-hidden="true">
  {#each bulbs as b, i (i)}
    <i style:left="{b.x}%" style:top="{b.y}%" style:--p={i % 3} style:--r={(i * 7919) % 13} class:b={i % 2 === 1}></i>
  {/each}
</div>

<style>
  .lights {
    position: absolute;
    inset: 7px;
    pointer-events: none;
    z-index: 2;
  }
  i {
    --c: var(--bulb-a, #ffd75e);
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fff 0 18%, var(--c) 45%, color-mix(in srgb, var(--c) 55%, #000) 100%);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.45),
      0 0 6px var(--c),
      0 0 16px color-mix(in srgb, var(--c) 75%, transparent);
    opacity: 0.3;
    animation: chase 1.8s steps(1, end) infinite;
    animation-delay: calc(var(--p) * -0.6s);
  }
  i.b {
    --c: var(--bulb-b, var(--bulb-a, #ffd75e));
  }
  /* Groups of three take turns, so the light seems to run round the frame. */
  @keyframes chase {
    0% {
      opacity: 1;
    }
    33.3% {
      opacity: 0.22;
    }
  }
  .spin i {
    animation-duration: 0.36s;
    animation-delay: calc(var(--p) * -0.12s);
  }
  .win i {
    animation: flash 0.32s steps(1, end) infinite;
  }
  @keyframes flash {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.2;
    }
  }
  .bonus {
    animation: hue 2.4s linear infinite;
  }
  .bonus i {
    animation-duration: 0.5s;
    animation-delay: calc(var(--p) * -0.166s);
  }
  @keyframes hue {
    to {
      filter: hue-rotate(360deg);
    }
  }
  .party {
    animation: hue 1.2s linear infinite;
  }
  .party i {
    animation: flash 0.18s steps(1, end) infinite;
    animation-delay: calc(var(--r) * -0.014s);
  }
  @media (prefers-reduced-motion: reduce) {
    i,
    .lights {
      animation: none !important;
      opacity: 0.8;
    }
  }
</style>
