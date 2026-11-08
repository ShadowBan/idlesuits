<script lang="ts">
  import { CSP_BONUSES as BONUSES, type CspRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { sideBetsGlance } from '../../lib/glance';

  let { rules }: { rules: CspRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Five cards', demo: 'Ante', text: 'You get five cards; the dealer shows one of theirs.' },
    { title: 'Raise or fold', demo: `${rules.raise}×`, text: 'Raise twice the ante to play on, or fold the ante.' },
    { title: 'Showdown', demo: 'A-K', text: 'The dealer needs ace-king or better to qualify.' },
  ]}
  glance={[
    {
      heading: 'Your bets',
      items: [
        { name: 'Ante', tag: '1:1', text: 'Your bet to see five cards. Pays when you beat a qualifying dealer, or whenever the dealer does not qualify.' },
        { name: 'Raise', tag: 'up to 100:1', text: `${rules.raise}× the Ante to play on, or fold the Ante. Beat a qualifying dealer and it is paid by your hand; if the dealer does not qualify it comes back.` },
      ],
    },
    sideBetsGlance(BONUSES),
  ]}
>
  {#snippet goal()}
    Beat the dealer's five cards. <b>The bigger your hand, the more the raise pays.</b>
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>Dealer does not qualify: the Ante pays 1:1 and the Raise comes back.</li>
      <li>Dealer qualifies and you win: the Ante pays 1:1 and the Raise by the pay table, up to 100:1 for a royal.</li>
      <li>Dealer qualifies and wins: both lose. A tie pushes both.</li>
    </ul>
  </details>


  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>R</kbd> raise · <kbd>F</kbd> fold · <kbd>Space</kbd> takes the suggestion, or deals.</li>
      <li>
        The suggestion is Wizard of Odds' strategy, within 0.001% of perfect: raise any pair, fold under ace-king, and
        raise ace-king when the dealer's card pairs one of yours, or you hold a queen or jack against an ace or king.
      </li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
