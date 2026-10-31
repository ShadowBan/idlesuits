<script lang="ts">
  import { formatTokens } from './format';
  import Loadout from './Loadout.svelte';
  import { meta } from '../../lib/meta.svelte';
</script>

<!-- A table's view of the charms on: what they do, and the way to the machine. -->
<section class="panel">
  <h2>Charms <a href="#/charms">Charm Machine · ◉ {formatTokens(meta.tokens)}</a></h2>
  <Loadout compact />
</section>

<style>
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  h2 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  a {
    letter-spacing: 0;
    text-transform: none;
    color: #f2d27a;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
