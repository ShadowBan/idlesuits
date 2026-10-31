<script lang="ts">
  import { CHARM_ART } from './art';

  interface Props {
    id: string;
    /** Not found yet: drawn as a dark silhouette, a shape to hunt for. */
    hidden?: boolean;
  }

  let { id, hidden = false }: Props = $props();
</script>

<svg class="art" class:hidden viewBox="0 0 64 64" aria-hidden="true">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own static drawings -->
  {@html CHARM_ART[id] ?? ''}
</svg>

<style>
  .art {
    display: block;
    width: var(--art, 48px);
    height: var(--art, 48px);
    overflow: visible;
    filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.35));
  }
  .hidden {
    filter: brightness(0) opacity(0.35);
  }
</style>
