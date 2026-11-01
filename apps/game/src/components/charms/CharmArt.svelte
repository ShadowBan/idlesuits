<script lang="ts">
  import { findCharm } from '@idlesuits/sim';
  import { CHARM_ART } from './art';

  interface Props {
    id: string;
    /** Not found yet: drawn as a dark silhouette, a shape to hunt for. */
    hidden?: boolean;
  }

  let { id, hidden = false }: Props = $props();

  /** A Secret charm not found yet gives nothing away, not even its shape. */
  const secret = $derived(hidden && findCharm(id)?.rarity === 'secret');
</script>

<svg class="art" class:hidden class:secret viewBox="0 0 64 64" aria-hidden="true">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own static drawings -->
  {#if secret}
    <circle cx="32" cy="32" r="22" fill="#2a1a12" stroke="#2a1a12" stroke-width="2.5" />
    <text x="32" y="43" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="30" fill="#ff7ad9">?</text>
  {:else}
    {@html CHARM_ART[id] ?? ''}
  {/if}
</svg>

<style>
  .art {
    display: block;
    width: var(--art, 48px);
    height: var(--art, 48px);
    overflow: visible;
    filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.35));
  }
  .hidden:not(.secret) {
    filter: brightness(0) opacity(0.35);
  }
</style>
