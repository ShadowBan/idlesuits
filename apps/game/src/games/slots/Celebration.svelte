<script lang="ts">
  /**
   * Behind a big win: rays turning, and a shower in the machine's own style:
   * gold coins from the vault, sparks from the forge, doubloons from the
   * pirates, confetti from the big top, petals and sparks from the lanterns.
   * The bigger the win (level 1 to 4), the more of it there is.
   */
  interface Props {
    id: string;
    level: number;
  }

  let { id, level }: Props = $props();

  const SHAPE: Record<string, string> = { vault: 'coin', forge: 'spark', haul: 'coin', carnival: 'confetti', lanterns: 'petal' };
  const COLORS: Record<string, string[]> = {
    vault: ['#f2c64e', '#ffe69a', '#d9a531'],
    forge: ['#ffcf6b', '#ff8a2a', '#ff5a1f', '#fff3b0'],
    haul: ['#e8b84a', '#ffe08a', '#c9922b'],
    carnival: ['#ffd75e', '#e8344f', '#4cc9b0', '#7ad8ff', '#d08cff', '#fff4d6'],
    lanterns: ['#ff7a3a', '#ffc04a', '#e8344f', '#ffe2a0'],
  };
  const shape = $derived(SHAPE[id] ?? 'coin');
  const colors = $derived(COLORS[id] ?? COLORS.vault!);
  const bits = $derived.by(() => {
    let x = 17 + level * 31;
    const next = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 16 + level * 14 }, (_, i) => ({ x: next() * 100, d: next(), s: next(), c: colors[i % colors.length]! }));
  });
</script>

<div class="celebrate {shape} l{level}" aria-hidden="true">
  <span class="rays"></span>
  <span class="burst"></span>
  {#each bits as b, i (i)}
    <i style:left="{b.x}%" style:--d={b.d} style:--s={b.s} style:--c={b.c}></i>
  {/each}
</div>

<style>
  .celebrate {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: inherit;
  }
  .rays {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 220%;
    aspect-ratio: 1;
    translate: -50% -50%;
    background: repeating-conic-gradient(rgb(255 230 150 / 0.16) 0 8deg, transparent 8deg 20deg);
    mask: radial-gradient(circle, #000 10%, transparent 55%);
    animation: turn 9s linear infinite;
  }
  .l3 .rays,
  .l4 .rays {
    animation-duration: 4.5s;
    background: repeating-conic-gradient(rgb(255 230 150 / 0.24) 0 8deg, transparent 8deg 20deg);
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 30%;
    aspect-ratio: 1;
    translate: -50% -50%;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(255 255 255 / 0.9), rgb(255 215 94 / 0.4) 40%, transparent 70%);
    animation: burst 0.9s ease-out forwards;
  }
  @keyframes burst {
    from {
      scale: 0.2;
      opacity: 1;
    }
    to {
      scale: 5;
      opacity: 0;
    }
  }
  i {
    position: absolute;
    top: -24px;
    animation: shower calc(1.6s + var(--d) * 1.8s) linear infinite;
    animation-delay: calc(var(--d) * -3.4s);
  }
  @keyframes shower {
    from {
      transform: translate(0, 0) rotate(0deg) rotateY(0deg);
    }
    to {
      transform: translate(calc((var(--s) - 0.5) * 120px), 120cqh) rotate(calc(var(--s) * 720deg)) rotateY(1080deg);
    }
  }
  /* Coins: gold discs with a rim, flipping as they fall. */
  .coin i {
    width: calc(14px + var(--s) * 12px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff6c8, var(--c) 45%, color-mix(in srgb, var(--c) 55%, #3d2a08));
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--c) 60%, #000),
      0 0 8px rgb(242 198 78 / 0.5);
  }
  .spark i {
    width: 3px;
    height: calc(8px + var(--s) * 14px);
    border-radius: 2px;
    background: linear-gradient(#fff, var(--c));
    box-shadow: 0 0 8px var(--c);
    top: auto;
    bottom: -24px;
    animation-name: sparkup;
    animation-duration: calc(0.9s + var(--d) * 1.2s);
  }
  @keyframes sparkup {
    from {
      transform: translate(0, 0) rotate(calc((var(--s) - 0.5) * 50deg));
      opacity: 1;
    }
    to {
      transform: translate(calc((var(--s) - 0.5) * 260px), -90cqh) rotate(calc((var(--s) - 0.5) * 50deg));
      opacity: 0;
    }
  }
  .confetti i {
    width: 8px;
    height: 14px;
    border-radius: 2px;
    background: var(--c);
  }
  .petal i {
    width: calc(10px + var(--s) * 8px);
    aspect-ratio: 1;
    border-radius: 0 70% 0 70%;
    background: linear-gradient(135deg, #fff, var(--c));
    box-shadow: 0 0 8px var(--c);
    opacity: 0.9;
  }
  @media (prefers-reduced-motion: reduce) {
    i,
    span {
      animation: none !important;
      display: none;
    }
  }
</style>
