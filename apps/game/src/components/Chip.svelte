<script lang="ts">
  import { chipLabel, chipLook } from '../lib/chips';

  interface Props {
    /** Index on the chip ladder (see lib/chips). */
    index: number;
    /** Show the denomination; stacked chips below the top one leave it off. */
    label?: boolean;
  }

  let { index, label = true }: Props = $props();

  const look = $derived(chipLook(index));
  const text = $derived(chipLabel(index));
  /** Six edge inserts, as on a real clay chip. */
  const SPOTS = [0, 60, 120, 180, 240, 300];
</script>

<svg class="chip" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="48" fill={look.base} />
  {#each SPOTS as angle (angle)}
    <rect x="44" y="2" width="12" height="15" rx="2" fill={look.edge} transform="rotate({angle} 50 50)" />
  {/each}
  <circle cx="50" cy="50" r="33" fill="none" stroke={look.edge} stroke-width="2.5" stroke-dasharray="5 4" opacity="0.85" />
  <circle cx="50" cy="50" r="29" fill={look.base} />
  {#if look.rim}<circle cx="50" cy="50" r="47" fill="none" stroke={look.rim} stroke-width="3" />{/if}
  <circle cx="50" cy="50" r="48" fill="none" stroke="rgb(0 0 0 / 0.35)" stroke-width="2" />
  {#if label}
    <text
      x="50"
      y="51"
      text-anchor="middle"
      dominant-baseline="central"
      fill={look.ink}
      font-size={text.length > 3 ? 20 : text.length > 2 ? 24 : 30}>{text}</text
    >
  {/if}
</svg>

<style>
  .chip {
    display: block;
    width: var(--chip, 40px);
    height: var(--chip, 40px);
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.5));
  }
  text {
    font-family: var(--font-display);
    font-weight: 700;
  }
</style>
