<script lang="ts">
  import type { MachineDef, SlotPayback } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatMoney, type Decimal } from '../../lib/money';
  import { JACKPOT_SEEDS, MAJOR_CAP } from '../../lib/jackpot.svelte';
  import { SUMMARY_MS } from './game.svelte';

  interface Props {
    machine: MachineDef;
    /** With the progressives at their seeds. */
    payback: SlotPayback;
    /** The bet now, so every example is in real money. */
    bet: Decimal;
    waysScale: number;
  }

  let { machine, payback, bet, waysScale }: Props = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }

  const money = (x: number) => formatMoney(bet.mul(x));
  /** Three aces, per way, at this bet: the worked example. */
  const ace = $derived(machine.symbols.find((s) => s.id === 'A')!.pays![0] * waysScale);
  const cells = $derived(machine.reels.length * machine.rows);
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Set a bet', demo: formatMoney(bet), text: 'Use − and + under the reels, or tap the amount for every level. Everything pays in multiples of it.' },
    { title: 'Match from the left', demo: 'A A A', text: 'The same symbol on 3, 4 or 5 reels side by side, starting at the left reel, in any row, pays.' },
    { title: 'Six coins', demo: '6 ●', text: 'Six gold coins anywhere start Hold & Spin, the bonus, where coins pay cash and jackpots.' },
  ]}
>
  {#snippet goal()}
    Match symbols across the reels from the left, and land <b>six gold coins</b> for the bonus.
  {/snippet}

  <details open>
    <summary>How a win is counted</summary>
    <ul>
      <li>
        There are no fixed lines. A symbol pays when it's on <b>reel 1</b> and on every reel after it, three reels or more,
        <b>in any row</b>. That's 3 × 3 × 3 × 3 × 3 = 243 ways to line up, hence "243 ways".
      </li>
      <li>
        Every way through counts. Say reel 1 shows two aces, reel 2 an ace and a Wild, reel 3 one ace, and reel 4 none: that's
        aces on three reels, 2 × 2 × 1 = <b>4 ways</b>. Three aces pay {money(ace)} a way at your bet, so it pays
        4 × {money(ace)} = <b>{money(ace * 4)}</b>.
      </li>
      <li>Only the longest run pays: aces on four reels pay the four-reel amount, not the three-reel one as well.</li>
      <li>Different symbols pay separately, and their wins add up. After a spin, each win is framed on the reels in turn with what it paid.</li>
      <li>The <b>Wild</b> (reels 2, 3 and 4) stands in for any symbol but the coin. It pays nothing on its own.</li>
      <li>The Pays tab beside the table lists every symbol's pay for 3, 4 and 5 reels, at your bet.</li>
    </ul>
  </details>

  <details>
    <summary>Hold & Spin, step by step</summary>
    <ol>
      <li>Land {machine.holdSpin.trigger} or more gold coins anywhere in one spin. On ordinary spins coins pay nothing; they're keys to the bonus.</li>
      <li>The coins lock in place. Every other cell becomes a reel of its own, and you get <b>{machine.holdSpin.respins} respins</b>.</li>
      <li>Press Respin and the empty cells spin. Any coin that lands locks too, and puts the respins back to {machine.holdSpin.respins}.</li>
      <li>A respin with no new coin uses one up. The bonus ends when none are left.</li>
      <li>Then every coin is counted: its cash ({money(1)} to {money(25)} at your bet), or the jackpot on it.</li>
      <li>Fill all {cells} cells and the <b>Grand</b> pays on top of every coin.</li>
      <li>The total stays up for {SUMMARY_MS / 1000} seconds; tap or press Space to collect sooner.</li>
    </ol>
  </details>

  <details>
    <summary>The four jackpots</summary>
    <ul>
      <li><b>Mini</b>: {machine.jackpots.mini}× your bet ({money(machine.jackpots.mini)}), on a coin in the bonus. Fixed.</li>
      <li><b>Minor</b>: {machine.jackpots.minor}× your bet ({money(machine.jackpots.minor)}), on a coin in the bonus. Fixed.</li>
      <li>
        <b>Major</b>: progressive, from {JACKPOT_SEEDS.major}× your bet. Won by a Major coin in the bonus, or by the must-hit draw
        below. It always pays before it reaches {MAJOR_CAP}× ({money(MAJOR_CAP)}).
      </li>
      <li><b>Grand</b>: progressive, from {JACKPOT_SEEDS.grand}× your bet. Won only by filling the whole screen in the bonus.</li>
    </ul>
  </details>

  <details>
    <summary>How the progressives grow and pay</summary>
    <ul>
      <li>
        The Major and Grand are shared by every machine on the slot floor. They grow with every hand you play anywhere in the
        casino, tables included, and a little every second the casino is open, like other players on a linked bank.
      </li>
      <li>They're counted in multiples of your bet, so the amount shown is what they'd pay on your bet right now.</li>
      <li>Hit one and it pays, then starts over from its starting amount for every machine.</li>
      <li>
        <b>Must hit by.</b> Each time the Major starts over, the machine secretly picks a point somewhere between
        {JACKPOT_SEEDS.major}× and {MAJOR_CAP}×. The first spin after the meter passes that point wins the Major, whatever
        the reels show. The point is never past the cap, so the bar under the Major filling up means it's getting close.
      </li>
    </ul>
  </details>

  <details>
    <summary>The odds</summary>
    <ul>
      <li>
        Pays back {(payback.total * 100).toFixed(1)}% of what's bet with the jackpots at their starting amounts, and more as
        they grow and with the must-hit Major. Worked out exactly from the reel strips.
      </li>
      <li>Hold & Spin starts about once in {Math.round(1 / payback.triggerRate)} spins and ends with {payback.featureCoins.toFixed(1)} coins on average.</li>
      <li>About one bonus in {Math.round(1 / payback.fullRate).toLocaleString('en-US')} fills the screen for the Grand.</li>
      <li>The reels and coins never look at the meters: no outcome is ever chosen to pay or hold back a jackpot.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li>Space or Enter spins, or tap the reels. The arrow keys raise and lower the bet.</li>
      <li>Auto play spins on its own and stops if you bust. Deal speed sets how fast the reels turn.</li>
      <li>
        Hold & Spin waits for you to press <b>Respin</b> (or tap, or Space) before each respin, even in auto play, which carries on
        once you collect. Turn off "Play the bonus yourself" under Automation to let it play itself while you're away.
      </li>
      <li>Hold & Spin plays at normal speed even at 2× or 5×, so it gets its full drama. Turn off "Bonus at normal speed" under Automation to have it follow the deal speed.</li>
    </ul>
  </details>
</RulesFrame>
