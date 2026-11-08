<script lang="ts">
  import { ROULETTE_EDGE } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';

  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Place chips', demo: '17 · Red', text: 'Pick a chip, then tap the layout: a number, the line between two, or a box outside.' },
    { title: 'Spin', demo: '0–36', text: 'The ball runs round the wheel and drops into one of 37 pockets.' },
    { title: 'Get paid', demo: '35:1', text: 'Every bet that covers the number pays. The fewer numbers a bet covers, the more it pays.' },
  ]}
  glance={[
    {
      heading: 'Inside bets',
      note: 'On the numbers themselves. Put the chip where the bet sits on the layout.',
      items: [
        { name: 'Straight up', tag: '35:1', text: 'One number. The chip goes in the middle of it.' },
        { name: 'Split', tag: '17:1', text: 'Two numbers side by side: the chip on the line between them.' },
        { name: 'Street', tag: '11:1', text: 'A row of three across: the chip on its outer edge, by the dozens. Also 0-1-2 and 0-2-3, by zero.' },
        { name: 'Corner', tag: '8:1', text: 'Four numbers that meet at a corner: the chip where their lines cross. Also 0-1-2-3, at the foot of zero.' },
        { name: 'Six line', tag: '5:1', text: 'Two streets side by side: the chip where they meet on the outer edge.' },
      ],
    },
    {
      heading: 'Outside bets',
      note: 'The boxes around the numbers. Zero loses every one of them.',
      items: [
        { name: 'Dozen', tag: '2:1', text: '1–12, 13–24 or 25–36.' },
        { name: 'Column', tag: '2:1', text: 'A row of twelve along the layout: the "2:1" box at its end.' },
        { name: 'Red or black · odd or even · 1–18 or 19–36', tag: '1:1', text: 'Half the numbers each: even money.' },
      ],
    },
  ]}
>
  {#snippet goal()}
    Guess where the ball will land. <b>The bigger the risk, the bigger the pay.</b>
  {/snippet}

  <details>
    <summary>The wheel and the odds</summary>
    <ul>
      <li>One zero and the numbers 1 to 36, half red and half black. Zero is green, and neither red nor black, odd nor even, low nor high.</li>
      <li>
        Every bet pays 36 for 1 split across the numbers it covers, less the stake: so every bet on the table, from a straight up to red,
        gives the house the same edge, {(ROULETTE_EDGE * 100).toFixed(2)}% (one pocket in 37). Mixing bets changes how bumpy the ride is,
        never the odds.
      </li>
      <li>Each spin is new: the wheel has no memory. The hot numbers in Stats are for fun, never a forecast.</li>
    </ul>
  </details>

  <details>
    <summary>Limits</summary>
    <ul>
      <li>All your chips together must make the table minimum, and no single bet can go past the table maximum.</li>
      <li>Your layout stays down from spin to spin. Clear takes it all back; Undo takes the last chip; Rebet puts the last spin's layout back.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>Space</kbd> spins · <kbd>Ctrl</kbd> <kbd>Z</kbd> undoes the last chip · <kbd>R</kbd> rebets.</li>
      <li>Right-click a bet to take its chips back. Hover a spot to see the numbers it covers.</li>
      <li><b>Auto</b> spins the same layout again and again.</li>
    </ul>
  </details>
</RulesFrame>
