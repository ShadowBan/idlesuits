<script lang="ts">
  import { JACKPOT_TIERS, type MachineDef, type PotPower, type SlotPayback } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import type { GlanceGroup, GlanceItem } from '../../lib/glance';
  import { formatMoney, type Decimal } from '../../lib/money';
  import { JACKPOT_SEEDS, MAJOR_CAP } from '../../lib/jackpot.svelte';
  import { bonusName, carrierName, SUMMARY_MS, TIER_NAME, WHEEL_NAMES } from './game.svelte';

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
  const bonus = $derived(machine.bonus);
  const name = $derived(bonusName(machine));
  const once = $derived(Math.round(1 / payback.triggerRate));
  /** What a pot's power does, in full. */
  function powerLong(power: PotPower): string {
    const b = bonus;
    switch (power.kind) {
      case 'boost':
        return `after every respin, every coin on the screen grows by the same cash, from a fraction of the bet up to ${Math.max(...power.values.map((v) => v.value))}×.`;
      case 'extra':
        return `respins start and reset at ${power.respins}, not ${b.kind === 'holdSpin' ? b.respins : 3}: more coins, and a better shot at the Grand.`;
      case 'collect':
        return 'when the respins end, a collector takes every coin’s cash again, boosts included. Jackpots pay once.';
      case 'level':
        return b.kind === 'collect'
          ? `the captains start at ${b.multipliers[power.levels]}× cash, with the meter already that far along, and climb from there.`
          : `the forge starts ${power.levels === 1 ? 'a tier' : `${power.levels} tiers`} up: bronze shows as silver from the first spin, and crowns are a strike closer.`;
      case 'marks':
        return `every ${b.kind === 'collect' ? 'captain' : 'hammer'} counts ${power.times === 2 ? 'twice' : `${power.times} times`} on the meter.`;
      case 'wilds':
        return `every wild in free spins is ${power.x}×: each way through it pays ${power.x} times over, and two wilds on one way multiply together.`;
      case 'spins':
        return `${power.add} more free spins to start with: ${b.kind === 'upgrade' || b.kind === 'collect' ? b.spins + power.add : power.add} in all.`;
      case 'cash':
        return `every doubloon in free spins carries ${power.times === 2 ? 'double' : `${power.times}×`} its cash, before the captains' multiplier. Jackpots stay as they are.`;
      case 'ups':
        return `the outer wheel's ${power.add} smallest wedges turn to Up, so it climbs to the inner wheels more often.`;
      case 'ring': {
        const total = power.values.reduce((a, v) => a + v.weight, 0);
        return `a ring spins with the wheel and multiplies the cash it lands on: ${power.values.map((v) => `×${v.value} ${Math.round((v.weight / total) * 100)}%`).join(', ')}. Jackpots aren't multiplied.`;
      }
      case 'encore':
        return 'once the wheel pays, it goes back to the outer wheel and plays again. Both pay.';
      case 'drop':
        return `the ${TIER_NAME[power.tier]} lanterns are gone: nine lanterns, and the pick plays for the bigger jackpots only.`;
      case 'twin':
        return 'once a jackpot is matched, a fresh board is laid out for a second one. Both pay.';
      case 'rise':
        return `the jackpot matched climbs a tier before it pays: Mini to Minor, Minor to Major. The ${TIER_NAME[power.top]} and up stay as they are.`;
    }
  }
  const scatterName = $derived(bonus.kind === 'holdSpin' ? 'gold coins' : `${machine.symbols.find((s) => s.id === bonus.scatter)?.name.toLowerCase()}s`);
  /** The machine's coin values, as cash at this bet: "$2.50 to $125". */
  const cashRange = $derived.by(() => {
    const xs = (machine.coinValues ?? []).flatMap((v) => (v.value.kind === 'cash' ? [v.value.x] : []));
    return xs.length ? `${money(Math.min(...xs))} to ${money(Math.max(...xs))}` : '';
  });
  /** Where this machine's own Major comes from, besides the must-hit draw. */
  const MAJOR_WAY: Record<string, string> = {
    holdSpin: 'on a coin in the bonus',
    upgrade: 'in the bonus',
    collect: 'on a doubloon a captain takes',
    wheel: 'on the crown wheel',
    pick: 'by matching three Majors in the pick',
  };
  const awards = $derived(JACKPOT_TIERS.filter((t) => t === 'major' || machine.awards.includes(t)));

  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const oneIn = (p: number) => `1 in ${Math.round(1 / p).toLocaleString('en-US')}`;

  /** The bonus, how it plays, in a few lines: the part every player should know. */
  const bonusItems = $derived.by((): GlanceItem[] => {
    switch (bonus.kind) {
      case 'holdSpin':
        return [
          { name: 'Lock the coins', tag: `${bonus.respins} respins`, text: `The gold coins lock in place and you get ${bonus.respins} respins. Only the empty cells spin; every new coin locks too and puts the respins back to ${bonus.respins}.` },
          { name: 'Count them up', text: `When the respins run out, every coin pays the cash on it (${cashRange} at your bet) or the jackpot it shows.` },
          { name: 'Fill the screen', tag: 'Grand', text: `Fill all ${cells} cells and the Grand pays on top of every coin.` },
        ];
      case 'upgrade':
        return [
          { name: 'Free spins', tag: `${bonus.spins} spins`, text: 'Reels heavy with horseshoes, which pay like any symbol: bronze at first.' },
          { name: 'Hammers strike', tag: `every ${bonus.perLevel}`, text: `Each hammer goes on the meter. Every ${bonus.perLevel} hammers, every horseshoe moves up a tier for the rest of the bonus, and you get ${bonus.extraSpins} more spins.` },
          { name: 'Bronze → silver → gold → crown', tag: payback.levelRates[3] ? `crowns ${oneIn(payback.levelRates[3])}` : undefined, text: 'Each tier pays more. Three strikes and every horseshoe is a crown, the top symbol.' },
          { name: 'A screen of crowns', tag: 'Grand', text: 'Nothing but crowns and wilds on the screen pays the Grand on top.' },
        ];
      case 'collect':
        return [
          { name: 'Doubloons and the captain', text: `Doubloons carry cash (${cashRange} at your bet) or a jackpot, but pay only when a captain takes them. Even on ordinary spins, a captain on reel 5 takes every doubloon on screen.` },
          { name: 'Free spins', tag: `${bonus.spins} spins`, text: 'Captains now sail reels 2 to 5, and every captain takes every doubloon: two captains take them twice.' },
          { name: 'The meter', tag: `up to ${bonus.multipliers.at(-1)}×`, text: `Every ${bonus.perLevel} captains add ${bonus.extraSpins} spins and raise the captains' cash to ${bonus.multipliers.slice(1).join('×, then ')}×. Jackpots are never multiplied.` },
        ];
      case 'wheel':
        return [
          { name: cap(WHEEL_NAMES[0]!), text: 'Spins first. Cash or a jackpot pays and ends the bonus; Up moves you to the next wheel in.' },
          { name: cap(WHEEL_NAMES[1]!), tag: oneIn(payback.levelRates[1]!), text: `Bigger cash, and the Minor. Up again moves on to the ${WHEEL_NAMES[2]}.` },
          { name: cap(WHEEL_NAMES[2]!), tag: oneIn(payback.levelRates[2]!), text: `The middle: the Major, the Grand and cash up to ${money(500)}.` },
        ];
      case 'pick': {
        const total = Object.values(bonus.weights).reduce((a, b) => a + b, 0);
        return [
          { name: 'Twelve lanterns', text: 'They hide three of each jackpot. Tap them open one at a time, or press Pick for me.' },
          { name: 'Match three', tag: 'a jackpot every time', text: 'The first jackpot to show three times pays. Every pick wins one.' },
          { name: 'The odds', text: JACKPOT_TIERS.map((t) => `${TIER_NAME[t]} ${((bonus.weights[t] / total) * 100).toFixed(1)}%`).join(' · ') + '. Settled when the bonus starts, so which lanterns you open doesn’t change it.' },
        ];
      }
    }
  });

  const glance = $derived.by((): GlanceGroup[] => {
    const groups: GlanceGroup[] = [
      {
        heading: 'Your bet',
        items: [
          { name: '243 ways', tag: 'Pays tab: every symbol', text: 'One bet covers every way. A symbol pays when it lands on reel 1 and each reel after it, three or more, in any row. Wins on different symbols add up.' },
          { name: 'Wild', tag: 'reels 2–4', text: 'Stands in for any pay symbol. Pays nothing on its own.' },
        ],
      },
      {
        heading: `The bonus: ${name}`,
        note: `Land ${bonus.kind === 'wheel' ? 'a ticket on each of reels 2, 3 and 4' : `${bonus.trigger} ${scatterName} anywhere`} to start it: about ${oneIn(payback.triggerRate)} spins. It pays ${money(payback.featurePay)} on average at your bet, and waits for you at every step.`,
        items: bonusItems,
      },
    ];
    if (machine.pots?.length)
      groups.push({
        heading: 'The pots',
        note: `On ordinary spins ${carrierName(machine)} can carry a gem that fills a pot a step. Pots keep their gems between spins, whatever you bet. Each full pot powers up the next bonus, then empties.`,
        items: [
          ...machine.pots.map((p, i) => ({ name: p.name, tag: `${p.size} gems · ${Math.round(payback.potRates[i]! * 100)}% of bonuses`, text: cap(powerLong(p.power)) })),
          { name: `Super ${name.toLowerCase()}`, tag: oneIn(payback.superRate), text: 'All three pots full at once: every power joins the same bonus.' },
        ],
      });
    groups.push({
      heading: 'Jackpots',
      note: 'Shown at your bet. The Major and Grand grow with play across the whole casino.',
      items: awards.map((t) => ({
        name: TIER_NAME[t],
        tag: t === 'mini' || t === 'minor' ? money(machine.jackpots[t]) : t === 'major' ? `must hit by ${money(MAJOR_CAP)}` : `from ${money(JACKPOT_SEEDS.grand)}`,
        text:
          t === 'mini' || t === 'minor'
            ? 'Fixed, in the bonus.'
            : t === 'major'
              ? `Progressive. ${machine.awards.includes('major') ? `Won ${MAJOR_WAY[bonus.kind]}, or` : 'Won here'} by the must-hit draw: it always pays before the meter passes ${MAJOR_CAP}×.`
              : `Progressive. ${{ holdSpin: 'Fill the whole screen in the bonus.', upgrade: 'A screen of crowns and wilds in free spins.', collect: 'On a rare doubloon, when a captain takes it.', wheel: `On one wedge of the ${WHEEL_NAMES[2]}.`, pick: 'Match three Grands in the pick.' }[bonus.kind]}`,
      })),
    });
    return groups;
  });

  const steps = $derived.by(() => {
    const first = { title: 'Set a bet', demo: formatMoney(bet), text: 'Use − and + under the reels, or tap the amount for every level. Everything pays in multiples of it.' };
    const match = { title: 'Match from the left', demo: 'A A A', text: 'The same symbol on 3, 4 or 5 reels side by side, starting at the left reel, in any row, pays.' };
    switch (bonus.kind) {
      case 'holdSpin':
        return [first, match, { title: 'Six coins', demo: '6 ●', text: 'Six gold coins anywhere start Hold & Spin, the bonus, where coins pay cash and jackpots.' }];
      case 'upgrade':
        return [first, match, { title: 'Three anvils', demo: '3 ⚒', text: 'Three anvils anywhere start free spins, where hammers forge the horseshoes up to crowns.' }];
      case 'collect':
        return [first, match, { title: 'The captain', demo: '● → ☠', text: 'Doubloons carry cash. A captain on reel 5 takes every one; three maps start free spins.' }];
      case 'wheel':
        return [first, match, { title: 'Three tickets', demo: '3 ◎', text: 'A ticket on reels 2, 3 and 4 spins the carnival wheel, for cash and every jackpot.' }];
      case 'pick':
        return [first, match, { title: 'Three lanterns', demo: '3 ◉', text: 'Three lanterns start the jackpot pick: match three of a jackpot to win it.' }];
    }
  });
</script>

<RulesFrame bind:this={frame} {steps} {glance}>
  {#snippet goal()}
    Match symbols across the reels from the left, and land <b>{bonus.trigger} {scatterName}</b> for the {name.toLowerCase()}.
  {/snippet}

  <details>
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
      <li>The <b>Wild</b> (reels 2, 3 and 4) stands in for any pay symbol. It pays nothing on its own.</li>
      <li>The Pays tab beside the table lists every symbol's pay for 3, 4 and 5 reels, at your bet.</li>
    </ul>
  </details>

  {#if bonus.kind === 'holdSpin'}
    <details>
      <summary>Hold & Spin, step by step</summary>
      <ol>
        <li>Land {bonus.trigger} or more gold coins anywhere in one spin. On ordinary spins coins pay nothing; they're keys to the bonus.</li>
        <li>The coins lock in place. Every other cell becomes a reel of its own, and you get <b>{bonus.respins} respins</b>.</li>
        <li>Press Respin and the empty cells spin. Any coin that lands locks too, and puts the respins back to {bonus.respins}.</li>
        <li>A respin with no new coin uses one up. The bonus ends when none are left.</li>
        <li>Then every coin is counted: its cash ({cashRange} at your bet), or the jackpot on it.</li>
        <li>Fill all {cells} cells and the <b>Grand</b> pays on top of every coin.</li>
        <li>The total stays up for {SUMMARY_MS / 1000} seconds; tap or press Space to collect sooner.</li>
      </ol>
    </details>
  {:else if bonus.kind === 'upgrade'}
    <details>
      <summary>The forge, step by step</summary>
      <ol>
        <li>Land {bonus.trigger} anvils anywhere in one spin for <b>{bonus.spins} free spins</b>, on reels heavy with horseshoes. Press Start.</li>
        <li>Hammers land on the free-spin reels. Each one lights and goes on the meter under the reels.</li>
        <li>
          Every <b>{bonus.perLevel} hammers</b>, the forge strikes: every horseshoe moves up a tier, <b>bronze to silver to gold to crown</b>,
          and you get <b>{bonus.extraSpins} more spins</b>. It counts from the next spin, and it lasts the rest of the bonus.
        </li>
        <li>After three strikes every horseshoe is a crown, the best-paying symbol.</li>
        <li>Fill the whole screen with crowns and wilds and the <b>Grand</b> pays on top of the ways, once a bonus.</li>
        <li>The total stays up for {SUMMARY_MS / 1000} seconds; tap or press Space to collect sooner.</li>
      </ol>
    </details>
  {:else if bonus.kind === 'collect'}
    <details>
      <summary>The captain and the doubloons</summary>
      <ol>
        <li>Doubloons carry cash ({cashRange} at your bet) or a jackpot. On their own they pay nothing.</li>
        <li>On the base game, the <b>captain</b> sails reel 5 only. When he lands, he takes the value of every doubloon on the screen.</li>
        <li>Land {bonus.trigger} maps anywhere for <b>{bonus.spins} free spins</b>. Press Start. Captains sail reels 2 to 5 now, and every captain takes every doubloon: two captains take them twice.</li>
        <li>
          Each captain goes on the meter. Every <b>{bonus.perLevel} captains</b> add <b>{bonus.extraSpins} spins</b> and raise the cash the
          captains take to <b>{bonus.multipliers.slice(1).join('×, then ')}×</b>, from the next spin. Jackpots are never multiplied.
        </li>
        <li>The total stays up for {SUMMARY_MS / 1000} seconds; tap or press Space to collect sooner.</li>
      </ol>
    </details>
  {:else if bonus.kind === 'wheel'}
    <details>
      <summary>The carnival wheel</summary>
      <ol>
        <li>A wheel ticket on reels 2, 3 and 4 in one spin starts the bonus. Press Spin wheel.</li>
        <li>The <b>{WHEEL_NAMES[0]}</b> turns and stops on a wedge. Every wedge is as likely as every other.</li>
        <li>Cash or a jackpot pays and ends the bonus. <b>Up</b> lights the next wheel in, which you spin in turn.</li>
        <li>
          The {WHEEL_NAMES[1]} holds bigger cash and the Minor; the <b>{WHEEL_NAMES[2]}</b> at the middle holds the Major, the Grand and
          up to {money(500)}.
        </li>
        <li>
          1 in {Math.round(1 / payback.levelRates[1]!)} plays reach the {WHEEL_NAMES[1]}, and 1 in
          {Math.round(1 / payback.levelRates[2]!)} the {WHEEL_NAMES[2]}{machine.pots?.length ? ', counting the pots' : ''}.
        </li>
      </ol>
    </details>
  {:else if bonus.kind === 'pick'}
    <details>
      <summary>The jackpot pick</summary>
      <ol>
        <li>Land {bonus.trigger} lanterns anywhere in one spin. Twelve lanterns appear, hiding three of each jackpot.</li>
        <li>Tap a lantern to open it, or press Pick for me. The tally above keeps count.</li>
        <li>The first jackpot to show <b>three times</b> pays, and the rest of the board is shown.</li>
        <li>
          {#each JACKPOT_TIERS as t, i (t)}{i ? ', ' : ''}{TIER_NAME[t]} {((bonus.weights[t] / Object.values(bonus.weights).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%{/each}
          of the time. The jackpot is settled when the bonus starts, as on a real machine, so which lanterns you pick doesn't change it.
        </li>
      </ol>
    </details>
  {/if}

  {#if machine.pots?.length}
    {@const pots = machine.pots}
    <details>
      <summary>The pots</summary>
      <ol>
        <li>
          Three pots sit over the reels. On ordinary spins, {carrierName(machine)} can carry a gem in a pot's colour, and each gem fills
          that pot a step. Green fills fastest, then blue, then purple.
        </li>
        <li>
          The pots keep what they hold from spin to spin, whatever you bet, and while you're away. A full pot stays lit until the next
          bonus ({name.toLowerCase()}).
        </li>
        <li>
          When the bonus starts, every full pot joins it and empties. Pots that aren't full keep their gems for next time.
          {#each pots as p (p.id)}<br /><b>{p.name}</b> ({p.size} gems): {powerLong(p.power)}{/each}
        </li>
        <li>Any of them can join together. All three at once make it a Super bonus: <b>Super {name.toLowerCase()}</b>.</li>
      </ol>
    </details>
  {/if}

  <details>
    <summary>The jackpots</summary>
    <ul>
      {#each awards as t (t)}
        <li>
          {#if t === 'mini' || t === 'minor'}
            <b>{TIER_NAME[t]}</b>: {machine.jackpots[t]}× your bet ({money(machine.jackpots[t])}). Fixed.
          {:else if t === 'major'}
            <b>Major</b>: progressive, from {JACKPOT_SEEDS.major}× your bet.
            {machine.awards.includes('major') ? `Won ${MAJOR_WAY[bonus.kind]}, or by` : 'Won here by'} the must-hit draw below. It always pays
            before it reaches {MAJOR_CAP}× ({money(MAJOR_CAP)}).
          {:else}
            <b>Grand</b>: progressive, from {JACKPOT_SEEDS.grand}× your bet.
            {#if bonus.kind === 'holdSpin'}Won only by filling the whole screen in the bonus.
            {:else if bonus.kind === 'upgrade'}Won by a screen of nothing but crowns and wilds in free spins.
            {:else if bonus.kind === 'collect'}On a rare doubloon, when a captain takes it.
            {:else if bonus.kind === 'wheel'}On one wedge of the {WHEEL_NAMES[2]}.
            {:else}By matching three Grands in the pick.{/if}
          {/if}
        </li>
      {/each}
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
        <b>Must hit by.</b> Each time the Major starts over, the floor secretly picks a point somewhere between
        {JACKPOT_SEEDS.major}× and {MAJOR_CAP}×. The first spin on any machine after the meter passes that point wins the Major,
        whatever the reels show. The point is never past the cap, so the bar under the Major filling up means it's getting close.
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
      <li>The bonus starts about once in {once} spins and pays {money(payback.featurePay)} on average at your bet.</li>
      {#if bonus.kind === 'holdSpin'}
        <li>It ends with {payback.featureCoins.toFixed(1)} coins on average, and about one in {Math.round(1 / payback.fullRate).toLocaleString('en-US')} fills the screen for the Grand.</li>
      {:else if bonus.kind === 'upgrade' || bonus.kind === 'collect'}
        <li>
          It lasts {payback.featureSpins.toFixed(1)} spins on average.
          {#each payback.levelRates.slice(1) as p, i (i)}1 in {Math.round(1 / p)} reach{bonus.kind === 'upgrade' ? ` ${['silver', 'gold', 'crowns'][i]}` : ` ${bonus.multipliers[i + 1]}×`}{i < payback.levelRates.length - 2 ? ', ' : '.'}{/each}
        </li>
        {#if bonus.kind === 'upgrade'}<li>About one bonus in {Math.round(1 / payback.fullRate).toLocaleString('en-US')} fills the screen with crowns.</li>{/if}
      {/if}
      {#if machine.pots?.length}
        <li>
          In the long run, {machine.pots.map((p, i) => `${p.name} is full for ${Math.round(payback.potRates[i]! * 100)}%`).join(', ')} of bonuses.
          About one bonus in {Math.round(1 / payback.superRate)} is a Super.
        </li>
      {/if}
      <li>The reels and bonuses never look at the meters: no outcome is ever chosen to pay or hold back a jackpot.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li>Space or Enter spins, or tap the reels. The arrow keys raise and lower the bet.</li>
      <li>Auto play spins on its own and stops if you bust. Deal speed sets how fast the reels turn.</li>
      <li>
        The bonus waits for you at each step (a respin, Start, Spin wheel or a pick), even in auto play, which carries on once you
        collect. Turn off "Play the bonus yourself" in the auto play settings (⚙ by the Auto switch) to let it play itself while you're away.
      </li>
      <li>The bonus plays at normal speed even at 2× or 5×, so it gets its full drama. Turn off "Bonus at normal speed" in the auto play settings to have it follow the deal speed.</li>
    </ul>
  </details>
</RulesFrame>
