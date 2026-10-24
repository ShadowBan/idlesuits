<script lang="ts">
  interface Props {
    /** The game's name, printed large. */
    title: string;
    /** A rule or two, printed smaller beneath. */
    lines?: string[];
  }

  let { title, lines = [] }: Props = $props();
  const id = `arc-${Math.random().toString(36).slice(2, 8)}`;

  let paths = $state<SVGPathElement[]>([]);
  /** Straight, hidden copies of each line: text on a path only measures the part that fits. */
  let probes = $state<SVGTextElement[]>([]);
  /** Squeezed lengths for any line too long for its arc, so the print never runs off the ends. */
  let fit = $state<(number | undefined)[]>([]);

  $effect(() => {
    void title;
    void lines;
    let live = true;
    const measure = () => {
      if (!live) return;
      fit = probes.map((t, i) => {
        const room = (paths[i]?.getTotalLength() ?? 0) * 0.94;
        return t && room && t.getComputedTextLength() > room ? room : undefined;
      });
    };
    // Measure once mounted, and again once the display face has loaded.
    queueMicrotask(measure);
    document.fonts?.ready.then(measure);
    return () => (live = false);
  });
</script>

<!-- Printed on the felt, as a real layout is. It takes whatever room the table leaves, and fades when there is little. -->
<svg class="print" viewBox="0 0 1000 170" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <path bind:this={paths[0]} id="{id}-1" d="M 70,30 Q 500,150 930,30" />
    <path bind:this={paths[1]} id="{id}-2" d="M 150,66 Q 500,170 850,66" />
  </defs>
  <text class="t1 probe" bind:this={probes[0]}>{title}</text>
  <text class="t1">
    <textPath href="#{id}-1" startOffset="50%" text-anchor="middle" textLength={fit[0]} lengthAdjust="spacingAndGlyphs"
      >{title}</textPath
    >
  </text>
  {#if lines.length}
    <text class="t2 probe" bind:this={probes[1]}>{lines.join('  ·  ')}</text>
    <text class="t2">
      <textPath
        href="#{id}-2"
        startOffset="50%"
        text-anchor="middle"
        textLength={fit[1]}
        lengthAdjust="spacingAndGlyphs">{lines.join('  ·  ')}</textPath
      >
    </text>
  {/if}
</svg>

<style>
  .print {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: 130px;
    pointer-events: none;
    overflow: visible;
  }
  text {
    fill: var(--print);
    font-family: var(--font-display);
    text-transform: uppercase;
  }
  .probe {
    visibility: hidden;
  }
  .t1 {
    font-size: 46px;
    font-weight: 700;
    letter-spacing: 7px;
    opacity: 0.6;
  }
  .t2 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 3px;
    opacity: 0.55;
  }
</style>
