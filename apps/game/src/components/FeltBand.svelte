<script lang="ts">
  import type { Decimal } from '../lib/money';
  import FeltPrint from './FeltPrint.svelte';
  import ResultBanner from './ResultBanner.svelte';

  interface Props {
    /** The game's name and a rule or two, printed on the felt. */
    title: string;
    lines?: string[];
    /** The hand's result, shown over the print once settled. */
    result?: { title: string; net: Decimal; detail?: string; big?: boolean } | null;
    /** The grid area this band fills in the table's layout. */
    area?: string;
  }

  let { title, lines = [], result = null, area = 'band' }: Props = $props();
</script>

<!--
  The open felt between the dealer and the player: the printed name, and where
  results show, so a result never covers the cards. On a landscape phone there
  is no open felt; the band then floats over the bottom of the table.
-->
<div class="band" style:grid-area={area}>
  <FeltPrint {title} {lines} />
  {#if result}
    <ResultBanner title={result.title} net={result.net} detail={result.detail} big={result.big} />
  {/if}
</div>

<style>
  /* Size-contained: the print fills whatever room the table leaves and never asks for more. */
  .band {
    position: relative;
    align-self: stretch;
    width: 100%;
    min-height: 0;
    contain: size;
    display: grid;
    align-items: center;
  }
  @media (orientation: landscape) and (max-height: 520px) {
    .band {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 28%;
      pointer-events: none;
    }
    .band :global(.print) {
      display: none;
    }
  }
</style>
