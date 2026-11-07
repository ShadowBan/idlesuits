<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { MACHINES, MIDNIGHT_VAULT, slotPayback, type CoinValue, type JackpotTier, type WheelWedge } from '@idlesuits/sim';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { floor } from '../../lib/floor.svelte';
  import { JACKPOT_SEEDS, jackpots, MAJOR_CAP } from '../../lib/jackpot.svelte';
  import { Decimal, formatMoney } from '../../lib/money';
  import { formatLimit } from '../../lib/rooms';
  import { route } from '../../lib/route.svelte';
  import { unlockAudio } from '../../lib/sound';
  import { BET_STEPS, bonusName, carrierName, isSuper, powerText, SlotGame, SUMMARY_MS, TIER_LABEL, TIER_NAME, WHEEL_NAMES } from './game.svelte';
  import Celebration from './Celebration.svelte';
  import CountUp from './CountUp.svelte';
  import SlotAmbience from './SlotAmbience.svelte';
  import SlotLights, { type LightMode } from './SlotLights.svelte';
  import SlotLogo from './SlotLogo.svelte';
  import SlotRules from './SlotRules.svelte';
  import SlotSymbol from './SlotSymbol.svelte';
  import './cabinets.css';

  let { onExit }: GameProps = $props();

  const machine = MACHINES.find((m) => m.id === route.current) ?? MIDNIGHT_VAULT;
  const game = new SlotGame(machine);
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let rules = $state<SlotRules>();
  /** With the progressives at their seeds, for the rules; and as they stand, for the sidebar. */
  const payback = $derived(slotPayback(machine, game.waysScale));
  const live = $derived(slotPayback(machine, game.waysScale, jackpots.meters));
  const nextBet = $derived(BET_STEPS[game.step + 1] ? floor.room.min.mul(BET_STEPS[game.step + 1]!) : null);
  const cells = machine.reels.length * machine.rows;

  /** Cash on a coin: short, but with the cents a boost can add while they matter. */
  function coinMoney(amount: Decimal): string {
    const n = amount.toNumber();
    return n < 100 && Math.abs(n - Math.round(n)) > 1e-9 ? formatMoney(amount) : formatLimit(amount);
  }

  /** What a coin shows: its cash at this bet, boost included, or its jackpot. */
  function coinLabel(value: CoinValue, bet: Decimal, boost = 0): string {
    return value.kind === 'cash' ? coinMoney(bet.mul(value.x + boost)) : value.tier.toUpperCase();
  }

  /** The pots over the reels, if the machine has them. Each is tinted by how rare it is: green, blue, then purple. */
  const pots = machine.pots ?? [];
  const carriers = carrierName(machine);
  const allFull = $derived(pots.length > 1 && pots.every((p, i) => (game.pots[i] ?? 0) >= p.size));
  const superInPlay = $derived(isSuper(machine, game.potsInPlay));

  /** The bulbs: racing while the reels spin, flashing on a win, wild through a bonus and a big win. */
  const lightMode = $derived<LightMode>(
    game.bigWin || (game.summary && game.summary.level > 0)
      ? 'party'
      : game.triggered.length || game.inBonus || game.summary
        ? 'bonus'
        : game.spinning.some(Boolean)
          ? 'spin'
          : game.wins.length || game.collecting
            ? 'win'
            : 'idle',
  );
  const hot = $derived(game.inBonus || game.triggered.length > 0 || game.bigWin !== null);

  /** A run of each reel's own strip, twice over, for the blur while it spins: the base reels, or the free-spin reels. */
  const blurOf = (reels: readonly (readonly string[])[]) =>
    reels.map((strip, r) => {
      const run = Array.from({ length: 8 }, (_, i) => strip[(r * 11 + i * 3) % strip.length]!);
      return [...run, ...run];
    });
  const baseBlur = blurOf(machine.reels);
  const bonus = machine.bonus;
  const freeBlur = bonus.kind === 'upgrade' || bonus.kind === 'collect' ? blurOf(bonus.reels) : baseBlur;
  const blur = $derived(game.free ? freeBlur : baseBlur);

  /** What the bonus needs, in a few words, for the meter and the seat. */
  const trigger = $derived.by(() => {
    switch (bonus.kind) {
      case 'holdSpin':
        return 'Six coins start hold & spin';
      case 'upgrade':
        return 'Three anvils start free spins';
      case 'collect':
        return 'Three maps start free spins';
      case 'wheel':
        return 'Three tickets spin the wheel';
      case 'pick':
        return 'Three lanterns start the jackpot pick';
    }
  });
  const INTRO: Record<string, string> = {
    holdSpin: 'Line symbols up from the left reel, 243 ways. Six gold coins start hold & spin, and a full screen cracks the Grand.',
    upgrade:
      'Line symbols up from the left reel, 243 ways. Three anvils start free spins, where every three hammers forge the horseshoes up a tier, bronze to silver to gold to crown. A screen of crowns wins the Grand.',
    collect:
      'Line symbols up from the left reel, 243 ways. Doubloons carry cash and jackpots, and a captain on reel 5 takes them all. Three maps start free spins, where every fifth captain raises the multiplier.',
    wheel: 'Line symbols up from the left reel, 243 ways. Three wheel tickets on reels 2, 3 and 4 spin the carnival wheel. Land Up to climb to the crown wheel and its Grand.',
    pick: 'Line symbols up from the left reel, 243 ways. Three lanterns start the jackpot pick: pick lanterns until one jackpot shows three times.',
  };

  /** The wheel: each wedge's path and label, ring by ring, outermost first. */
  const RINGS = [
    { outer: 97, inner: 69 },
    { outer: 67, inner: 43 },
    { outer: 41, inner: 17 },
  ];
  function wedgePath(i: number, n: number, outer: number, inner: number): string {
    const a0 = ((i / n) * 360 - 90) * (Math.PI / 180);
    const a1 = (((i + 1) / n) * 360 - 90) * (Math.PI / 180);
    const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    return `M${p(outer, a0)} A${outer} ${outer} 0 0 1 ${p(outer, a1)} L${p(inner, a1)} A${inner} ${inner} 0 0 0 ${p(inner, a0)} Z`;
  }
  function wedgeLabel(w: WheelWedge): string {
    if (w.kind === 'up') return 'UP';
    if (w.kind === 'jackpot') return w.tier.toUpperCase();
    return formatLimit(shownBet.mul(w.x));
  }
  function wedgeFill(w: WheelWedge, i: number, ring: number): string {
    if (w.kind === 'up') return '#ffd75e';
    if (w.kind === 'jackpot') return TIER_COLORS[w.tier];
    const shades = [
      ['#6c3fd1', '#4a2a9a'],
      ['#c0306a', '#8a1f4c'],
      ['#1f8a8a', '#146464'],
    ][ring]!;
    return shades[i % 2]!;
  }
  const TIER_COLORS: Record<JackpotTier, string> = { mini: '#7ad8ff', minor: '#8cf08a', major: '#ff6b8b', grand: '#ffd75e' };

  /** The pick's board, in rows of four. */
  const PICK_COLS = 4;

  const CONTROL_NOTE: Record<string, string> = {
    holdSpin: 'Hold & spin stops and waits for you to start each respin.',
    upgrade: 'Free spins wait for you to press Start.',
    collect: 'Free spins wait for you to press Start.',
    wheel: 'The wheel waits for you to spin it.',
    pick: 'The pick waits for you to choose each lantern.',
  };

  // The progressive meters roll up smoothly as the link feeds them, to the cent.
  const grand = Tween.of(() => jackpots.grand, { duration: 900 });
  const major = Tween.of(() => jackpots.major, { duration: 900 });

  /** The jackpots this machine pays; the must-hit Major pays on every machine. */
  const JACKPOT_ROWS = $derived(
    (
      [
        { tier: 'grand', name: 'Grand', amount: game.bet.mul(grand.current) },
        { tier: 'major', name: 'Major', amount: game.bet.mul(major.current) },
        { tier: 'minor', name: 'Minor', amount: game.bet.mul(machine.jackpots.minor) },
        { tier: 'mini', name: 'Mini', amount: game.bet.mul(machine.jackpots.mini) },
      ] as const
    ).filter((j) => j.tier === 'major' || machine.awards.includes(j.tier)),
  );
  /** How far the Major has climbed toward the amount it must hit by. */
  const majorClimb = $derived((major.current - JACKPOT_SEEDS.major) / (MAJOR_CAP - JACKPOT_SEEDS.major));

  /** A meter's amount, with cents while they're worth showing, so it visibly ticks. */
  function meterMoney(amount: Decimal): string {
    if (amount.gte(1e7)) return formatMoney(amount);
    return `$${amount.toNumber().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const shownBet = $derived(seq.awaiting === 'spin' || !game.roundBet.gt(0) ? game.bet : game.roundBet);

  /**
   * After a spin, its wins take turns: all of them together, then each one
   * framed on its own with what it paid, so it's clear which ways paid.
   */
  let focus = $state(-1);
  $effect(() => {
    const wins = game.wins;
    focus = wins.length === 1 ? 0 : -1;
    if (wins.length < 2) return;
    let i = -1;
    const timer = setInterval(() => {
      i = i + 1 >= wins.length ? -1 : i + 1;
      focus = i;
    }, 1200);
    return () => clearInterval(timer);
  });
  const shown = $derived(focus >= 0 && game.wins[focus] ? [game.wins[focus]!] : game.wins);
  const lit = $derived(new Set(shown.flatMap((w) => w.cells.map(([r, row]) => `${r}:${row}`))));
  const focused = $derived(focus >= 0 ? game.wins[focus] : undefined);
  const symbolName = (id: string) => machine.symbols.find((s) => s.id === id)?.name ?? id;

  /** The bet picker: every level the room offers, open from the bet in the cabinet. */
  let picking = $state(false);
  function pick(step: number) {
    game.setStep(step);
    picking = false;
  }

  /** In hold & spin, an empty cell's own little reel: coins and blank vault panels going by. */
  const MINI = ['coin', 'tile', 'tile', 'coin', 'tile', 'tile', 'coin', 'tile', 'tile', 'coin', 'tile', 'tile'];

  function onTap() {
    if (seq.awaiting === 'pick') return;
    if (picking) picking = false;
    else if (game.summary || game.bigWin) game.dismiss();
    else game.spin();
  }

  function ago(at: number): string {
    const m = Math.round((Date.now() - at) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  }

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside')) return;
    if (e.key === 'ArrowUp') return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown') return game.setStep(game.step - 1);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    if (game.summary || game.bigWin) game.dismiss();
    else game.spin();
  }
</script>

<svelte:window onkeydown={onKey} />
<svelte:head>
  <!-- Each machine's lettering: deco, molten metal, pirate, circus and brush. -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Limelight&family=Metal+Mania&family=Pirata+One&family=Rye&display=swap" />
</svelte:head>
<SlotRules bind:this={rules} {machine} {payback} bet={game.bet} waysScale={game.waysScale} />

<TableShell
  machine
  cabinet={machine.id}
  title={[machine.name.split(' ')[0]!, machine.name.split(' ').slice(1).join(' ')]}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={onTap}
>
  {#snippet felt()}
    <div
      class="cabinet {machine.id}"
      class:in-feature={game.inBonus}
      class:has-pots={pots.length > 0}
      class:shake={(game.bigWin?.level ?? 0) >= 2 || (game.summary?.level ?? 0) >= 3}
      class:triggering={game.triggered.length > 0}
    >
      <SlotAmbience id={machine.id} {hot} />
      <SlotLogo id={machine.id} name={machine.name} {hot} />
      <!-- The jackpot marquee: the Major and Grand are the casino's linked progressives. -->
      <div class="marquee" aria-label="Jackpots" style:--plaques={JACKPOT_ROWS.length}>
        {#each JACKPOT_ROWS as j (j.tier)}
          <div class="plaque {j.tier}" class:progressive={j.tier === 'grand' || j.tier === 'major'}>
            <span>{j.name}</span>
            <b>{j.tier === 'grand' || j.tier === 'major' ? meterMoney(j.amount) : formatMoney(j.amount)}</b>
            {#if j.tier === 'major'}
              <!-- Must hit by: it pays before the meter reaches the cap. -->
              <small title="The Major pays before it reaches {formatMoney(game.bet.mul(MAJOR_CAP))}">
                <span class="wide">must hit</span> by {formatLimit(game.bet.mul(MAJOR_CAP))}
              </small>
              <i class="climb" style:--climb="{Math.min(1, Math.max(0, majorClimb)) * 100}%"></i>
            {/if}
          </div>
        {/each}
      </div>

      {#if pots.length}
        <!-- The pots: gems on whatever starts the bonus fill them, and they keep what they hold from spin to spin. A full one joins the next bonus. -->
        <div class="pots" class:ready={allFull} class:super={superInPlay} aria-label="Pots">
          {#each pots as pot, i (pot.id)}
            {@const n = game.pots[i] ?? 0}
            {@const inPlay = game.potsInPlay.includes(i)}
            <div
              class="pot r{i}"
              class:full={n >= pot.size}
              class:in-play={inPlay}
              title="{pot.name}: {powerText(pot.power, machine)}. {pot.name} gems on the {carriers} fill it; full, it joins the next {bonusName(machine).toLowerCase()}."
            >
              <span class="jar" style:--fill="{(inPlay ? 1 : n / pot.size) * 100}%" aria-hidden="true">
                <i></i>
                {#key game.potHits[i]}{#if game.potHits[i]}<em class="plink"></em>{/if}{/key}
              </span>
              <span class="pot-text">
                <b>{pot.name}</b>
                <small>{inPlay ? 'In play' : n >= pot.size ? 'Ready' : `${n} / ${pot.size}`}</small>
              </span>
              <span class="power">{powerText(pot.power, machine)}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- The bezel round the screen, with its bulbs. -->
      <div class="bezel">
        <SlotLights mode={lightMode} />
        <div class="glass" role="img" aria-label="Reels">
          {#each machine.reels as _, r (r)}
            <div
              class="reel"
              class:slow={game.anticipating === r}
              class:nudge-down={game.nudging?.reel === r && game.nudging.dir === 1}
              class:nudge-up={game.nudging?.reel === r && game.nudging.dir === -1}
              class:wild-reel={game.wilding === r && !game.inBonus}
            >
              {#if game.feature}
                <!-- Hold & spin: coins stay; empty cells spin on their own. -->
                {#each Array.from({ length: machine.rows }, (_, row) => row) as row (row)}
                  {@const cell = r * machine.rows + row}
                  {@const coin = game.feature.held[cell]}
                  {@const whirling = !coin && game.feature.spinning.includes(cell)}
                  <div
                    class="cell hs"
                    class:counting={game.feature.counting === cell}
                    class:empty={!coin}
                    class:fresh={game.feature.fresh.includes(cell)}
                    class:tense={whirling && game.feature.tense.includes(cell)}
                    class:collected={coin && game.feature.collecting}
                  >
                    {#if coin}
                      {@const boost = game.feature.boosted[cell] ?? 0}
                      {#key coin}<div class="drop"><SlotSymbol id="coin" coin={coin} label={coinLabel(coin, shownBet, boost)} /></div>{/key}
                      {#if coin.kind === 'jackpot' && boost}<span class="boosted">+{coinMoney(shownBet.mul(boost))}</span>{/if}
                      {#if game.feature.fresh.includes(cell)}<span class="gain">{coinLabel(coin, shownBet)}</span>{/if}
                      {#key game.feature.boosts}{#if game.feature.boosts && boost}<span class="gain boost">+{coinMoney(shownBet.mul(game.feature.boost))}</span>{/if}{/key}
                    {:else if whirling}
                      <div class="minireel" style:--delay="{-(cell * 37) % 200}ms">
                        {#each MINI as id, i (i)}
                          <div class="mini-cell">{#if id === 'coin'}<SlotSymbol {id} />{:else}{@render tile()}{/if}</div>
                        {/each}
                      </div>
                    {:else}
                      {@render tile()}
                    {/if}
                  </div>
                {/each}
              {:else if game.spinning[r]}
                <div class="strip" style:--n={blur[r]!.length / 2}>
                  {#each blur[r]! as id, i (i)}
                    <div class="cell"><SlotSymbol {id} /></div>
                  {/each}
                </div>
              {:else}
                {#each game.grid[r] ?? [] as id, row (row)}
                  {@const cell = r * machine.rows + row}
                  {@const coin = game.coins[cell]}
                  {@const taking = game.collecting !== null}
                  <div
                    class="cell land"
                    class:lit={lit.has(`${r}:${row}`)}
                    class:dim={(lit.size > 0 && !lit.has(`${r}:${row}`)) || (taking && !coin && game.collecting?.cell !== cell)}
                    class:mark={game.free?.marks.includes(cell)}
                    class:forged={game.free?.forged.includes(cell)}
                    class:taking={game.collecting?.cell === cell}
                    class:taken={taking && coin !== undefined}
                    class:trigger={game.triggered.includes(cell)}
                  >
                    <SlotSymbol {id} {coin} label={coin ? coinLabel(coin, shownBet) : undefined} />
                    {#if game.gems[cell] !== undefined}<i class="gem r{game.gems[cell]}" title="{pots[game.gems[cell]]?.name} gem"></i>{/if}
                    {#if id === 'wild' && game.free && game.free.wildX > 1}<span class="wild-x">×{game.free.wildX}</span>{/if}
                    {#if game.collecting?.cell === cell}<span class="gain">+{formatMoney(game.collecting.pay)}</span>{/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}

          {#if game.wheel}
            {@const w = game.wheel}
            <!-- The wheel bonus: three wheels, one inside the other; only the one in play turns. -->
            <div class="wheel-stage">
              <svg class="wheel" viewBox="-100 -100 200 200" role="img" aria-label="Bonus wheel, {WHEEL_NAMES[w.at]}">
                {#if bonus.kind === 'wheel'}
                  {#each w.wheels as wedges, ring (ring)}
                    {@const { outer, inner } = RINGS[ring]!}
                    <g
                      class="ring"
                      class:active={ring === w.at}
                      class:ahead={ring > w.at}
                      style:transform="rotate({w.angles[ring]}deg)"
                      style:transition-duration="{ring === w.at && w.spinning ? w.ms : 0}ms"
                    >
                      {#each wedges as wedge, i (i)}
                        {@const mid = ((i + 0.5) / wedges.length) * 360}
                        <path
                          d={wedgePath(i, wedges.length, outer, inner)}
                          fill={wedgeFill(wedge, i, ring)}
                          class="wedge"
                          class:hit={ring === w.at && w.landed === i}
                        />
                        <text
                          class="wl"
                          class:dark={wedge.kind !== 'cash'}
                          transform="rotate({mid}) translate(0 {-(outer + inner) / 2}) rotate({mid > 180 ? 90 : -90})"
                          text-anchor="middle"
                          dominant-baseline="central"
                          font-size={ring === 0 ? 8.5 : ring === 1 ? 8 : 6.6}
                        >
                          {wedgeLabel(wedge)}
                        </text>
                      {/each}
                    </g>
                  {/each}
                {/if}
                <circle r="15" class="hub" />
                <path d="M-9 4 L-11 -7 L-5 -2 L0 -10 L5 -2 L11 -7 L9 4 Z" fill="#ffd75e" stroke="#7a4f0c" stroke-width="1" />
                <!-- The pointer at the top, over the wheel in play. -->
                {#if RINGS[w.at]}
                  <path class="pointer" d="M-7 {-RINGS[w.at]!.outer - 4} L7 {-RINGS[w.at]!.outer - 4} L0 {-RINGS[w.at]!.outer + 9} Z" />
                {/if}
              </svg>
            </div>
          {/if}

          {#if game.pick}
            {@const p = game.pick}
            <!-- The jackpot pick: three lanterns for each jackpot on the board, twelve unless a pot cleared one away. -->
            <div class="pick-stage" class:waiting={seq.awaiting === 'pick'}>
              <div class="tally" style:--tiers={p.tiers.length}>
                {#each [...p.tiers].reverse() as tier (tier)}
                  <div class="tal {tier}" class:won={p.won === tier} class:close={p.counts[tier] === 2 && !p.won}>
                    <span>{TIER_NAME[tier]}</span>
                    <span class="pips">{#each [0, 1, 2] as i (i)}<i class:on={i < p.counts[tier]}></i>{/each}</span>
                  </div>
                {/each}
              </div>
              <div class="board" style:--cols={p.tiles.length % PICK_COLS ? 3 : PICK_COLS}>
                {#each p.tiles as tile, i (i)}
                  {@const picked = p.picked.includes(i)}
                  <button
                    type="button"
                    class="lantern {tile ?? ''}"
                    class:open={tile !== null}
                    class:rest={tile !== null && !picked}
                    class:just={p.last === i}
                    class:winner={p.won !== null && tile === p.won && picked}
                    disabled={tile !== null || seq.awaiting !== 'pick'}
                    aria-label={tile ? `${TIER_NAME[tile]}` : `Lantern ${i + 1}`}
                    onclick={() => game.choose(i)}
                  >
                    {#if tile}
                      <b>{TIER_NAME[tile]}</b>
                    {:else}
                      <SlotSymbol id="lantern" />
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if game.feature?.note}
            {#key game.feature.note + game.feature.left}
              <div class="respin-note" class:good={game.feature.fresh.length > 0} aria-live="polite">{game.feature.note}</div>
            {/key}
          {/if}

          {#if game.summary}
            {@const sum = game.summary}
            {#key sum.key}
              <!-- The bonus win: up for a few seconds, or until a tap closes it. -->
              {#if sum.level > 0}<div class="party-back"><Celebration id={machine.id} level={sum.level} /></div>{/if}
              <div class="summary" class:grand={sum.grand} role="status" style:--ms="{SUMMARY_MS}ms">
                <span class="eyebrow">{sum.title}</span>
                <b><CountUp amount={sum.bonus} ms={900 + sum.level * 500} /></b>
                <span class="detail">
                  {[...sum.details, ...sum.jackpots.map((t) => `${TIER_NAME[t]} jackpot`)].join(' · ')}
                </span>
                {#if !sum.total.eq(sum.bonus)}
                  <span class="detail">Total this spin {formatMoney(sum.total)}</span>
                {/if}
                <button type="button" class="primary" onclick={() => game.dismiss()}>Collect</button>
                <i class="countdown" aria-hidden="true"></i>
              </div>
            {/key}
          {/if}

          {#if game.bigWin}
            {@const bw = game.bigWin}
            {#key bw.key}
              <!-- A big win stops the machine: it counts up over the reels with the cabinet going wild. -->
              <div class="bigwin l{bw.level}" role="status">
                <Celebration id={machine.id} level={bw.level} />
                <b class="bw-title">{bw.title}</b>
                <span class="bw-amount"><CountUp amount={bw.amount} ms={bw.ms} /></span>
              </div>
            {/key}
          {/if}

          {#if game.banner}
            {#key game.banner.key}
              <div class="banner {game.banner.tier ?? 'feature'}" aria-live="assertive">
                <b>{game.banner.title}</b>
                {#if game.banner.amount}<span>{formatMoney(game.banner.amount)}</span>{/if}
                {#if game.banner.sub}<small>{game.banner.sub}</small>{/if}
              </div>
            {/key}
          {/if}
        </div>
      </div>

      <!-- Under the reels: the bet, and the win or how the feature is going. -->
      <div class="deck">
        <div class="bet" role="group" aria-label="Bet">
          <span class="k">Bet</span>
          <button type="button" class="step" aria-label="Lower bet" onclick={() => game.setStep(game.step - 1)} disabled={game.step === 0}>−</button>
          <button type="button" class="amount" aria-haspopup="listbox" aria-expanded={picking} onclick={() => (picking = !picking)}>
            {formatMoney(game.bet)}
          </button>
          <button type="button" class="step" aria-label="Raise bet" onclick={() => game.setStep(game.step + 1)} disabled={!nextBet || game.bank.lt(nextBet)}>+</button>
          {#if picking}
            <div class="levels" role="listbox" aria-label="Bet levels">
              {#each BET_STEPS as mult, i (mult)}
                {@const amount = floor.room.min.mul(mult)}
                <button type="button" role="option" aria-selected={i === game.step} disabled={game.bank.lt(amount)} onclick={() => pick(i)}>
                  {formatMoney(amount)}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="meter" aria-live="polite">
          {#if game.feature && !game.feature.done}
            {#key game.feature.resets}
              <span class="respins" class:flash={game.feature.resets > 0} aria-label="{game.feature.left} respins left">
                Respins
                {#each Array.from({ length: game.feature.respins }, (_, i) => i) as i (i)}
                  <i class:on={i < game.feature.left}></i>
                {/each}
              </span>
            {/key}
            {#if game.feature.last}<span class="last-spin">Last spin</span>{/if}
            {#if seq.awaiting === 'respin'}<span class="prompt">Press Respin</span>{/if}
            <span>{Object.keys(game.feature.held).length} / {cells}</span>
            <b>{formatMoney(game.feature.collected)}</b>
          {:else if game.free && !game.free.done && (bonus.kind === 'upgrade' || bonus.kind === 'collect')}
            {@const fv = game.free}
            {@const cap = bonus.perLevel * bonus.maxLevel}
            {@const into = fv.level >= bonus.maxLevel ? bonus.perLevel : fv.meter - fv.level * bonus.perLevel}
            <span>{fv.played ? `Spin ${fv.played} / ${fv.total}` : `${fv.total} spins`}</span>
            {#key fv.levelUps}
              <span class="respins" class:flash={fv.levelUps > 0} aria-label="{fv.meter} of {cap} {bonus.kind === 'upgrade' ? 'hammers' : 'captains'}">
                {bonus.kind === 'upgrade' ? 'Hammers' : 'Captains'}
                {#each Array.from({ length: bonus.perLevel }, (_, i) => i) as i (i)}
                  <i class:on={i < into}></i>
                {/each}
              </span>
            {/key}
            {#if bonus.kind === 'upgrade'}
              <!-- The forge's ladder: the tiers struck away so far are crossed out. -->
              <span class="ladder" aria-label="Lowest metal: {TIER_LABEL[bonus.tiers[Math.min(fv.level, bonus.tiers.length - 1)]!]}">
                {#each bonus.tiers as tier, i (tier)}
                  <i class:gone={i < fv.level} class:now={i === Math.min(fv.level, bonus.tiers.length - 1)}><SlotSymbol id={tier} /></i>
                {/each}
              </span>
            {:else}
              <span class="level">{bonus.multipliers[fv.level]}× cash</span>
            {/if}
            {#if seq.awaiting === 'free'}<span class="prompt">Press Start</span>{/if}
            <b>{formatMoney(fv.collected)}</b>
          {:else if game.wheel && !game.wheel.done}
            <span>{WHEEL_NAMES[game.wheel.at]}</span>
            {#if game.wheel.rounds > 1}<span>Spin {game.wheel.round} of {game.wheel.rounds}</span>{/if}
            {#if game.wheel.ring}<span class="level">Ring ×{game.wheel.ring}</span>{/if}
            {#if seq.awaiting === 'wheel'}<span class="prompt">Press Spin wheel</span>{/if}
            {#if game.wheel.collected.gt(0)}<b>{formatMoney(game.wheel.collected)}</b>{/if}
          {:else if game.pick && !game.pick.done}
            <span>{seq.awaiting === 'pick' ? 'Pick a lantern' : 'Picking'}</span>
            {#if game.pick.boards > 1}<span>Board {game.pick.board} of {game.pick.boards}</span>{/if}
            <span>{game.pick.picked.length} picked</span>
          {:else if game.win}
            {#if focused}
              <span class="way">
                {symbolName(focused.symbol)} × {focused.reels} · {focused.ways} {focused.ways === 1 ? 'way' : 'ways'} ·
                {formatMoney(shownBet.mul(focused.pay))}
              </span>
            {/if}
            <span>Win</span>
            <b class="won">{formatMoney(game.win)}</b>
          {:else}
            <span class="quiet">{seq.awaiting === 'spin' ? trigger : 'Good luck'}</span>
          {/if}
        </div>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro={INTRO[bonus.kind]!}
      hands={game.spins}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    <div class="spinbar">
      <div class="total">
        <span class="k">Bet</span>
        <b>{formatMoney(game.bet)}</b>
      </div>
      {#if seq.awaiting === 'respin'}
        <button type="button" class="spin primary respin-go" onclick={() => game.spin()}>Respin</button>
      {:else if seq.awaiting === 'free'}
        <button type="button" class="spin primary respin-go" onclick={() => game.spin()}>Start</button>
      {:else if seq.awaiting === 'wheel'}
        <button type="button" class="spin primary respin-go" onclick={() => game.spin()}>Spin wheel</button>
      {:else if seq.awaiting === 'pick'}
        <button type="button" class="spin" onclick={() => game.spin()}>Pick for me</button>
      {:else if game.autoPlay && game.started}
        <button type="button" class="spin" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
      {:else if game.summary || seq.awaiting === 'bigwin'}
        <button type="button" class="spin primary" onclick={() => game.dismiss()}>Collect</button>
      {:else}
        <button type="button" class="spin primary" disabled={!game.canSpin} onclick={() => game.spin()}>Spin</button>
      {/if}
      <div class="last">
        <span class="k">Last win</span>
        <b>{game.last && game.last.net > -1 ? formatMoney(game.lastBet.mul(game.last.net + 1)) : '—'}</b>
      </div>
    </div>
  {/snippet}

  {#snippet panels()}
    <TablePanels
      {seq}
      autoPlay={game.autoPlay}
      onAuto={(on) => game.setAutoPlay(on)}
      seed={game.runSeed}
      round={game.round}
      last={game.last}
      lastUnit={game.lastBet}
      stats={[
        ['Spins', String(game.spins)],
        ['Bonuses', String(game.features)],
        ['Paid back', game.wagered.gt(0) ? `${game.returned.div(game.wagered).mul(100).toNumber().toFixed(1)}%` : '—'],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history}
    >
      {#snippet automation()}
        <section class="panel">
          <label class="switch">
            <input type="checkbox" checked={game.bonusFull} onchange={(e) => game.setBonusFull(e.currentTarget.checked)} />
            Bonus at normal speed
          </label>
          <p class="note">The bonus plays out in full even when the deal speed is faster. Off, it follows the deal speed.</p>
          <label class="switch">
            <input type="checkbox" checked={game.bonusControl} onchange={(e) => game.setBonusControl(e.currentTarget.checked)} />
            Play the bonus yourself
          </label>
          <p class="note">
            {CONTROL_NOTE[bonus.kind]} It waits even in auto play, which carries on once you collect. Off, it plays itself, for
            running unattended.
          </p>
        </section>
      {/snippet}
      <section class="panel">
        <h2>Pays <span>per way, at a {formatMoney(game.bet)} bet</span></h2>
        <table class="pays">
          <thead><tr><th></th><th>3</th><th>4</th><th>5</th></tr></thead>
          <tbody>
            {#each machine.symbols.filter((s) => s.pays) as s (s.id)}
              <tr>
                <td class="art"><SlotSymbol id={s.id} /></td>
                {#each s.pays! as p, i (i)}<td>{formatMoney(game.bet.mul(p * game.waysScale))}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">Wilds on reels 2–4 stand in for every pay symbol.</p>
      </section>
      <section class="panel">
        <h2>{bonusName(machine)}</h2>
        <p class="note">
          {#if bonus.kind === 'holdSpin'}
            {bonus.trigger}+ coins start it, about once in {Math.round(1 / payback.triggerRate)} spins. Coins stick, each new one resets the
            {bonus.respins} respins, and a full screen pays the Grand on top.
          {:else if bonus.kind === 'upgrade'}
            {bonus.trigger} anvils start {bonus.spins} free spins, about once in {Math.round(1 / payback.triggerRate)} spins. Every
            {bonus.perLevel} hammers forge every horseshoe up a tier and add {bonus.extraSpins} spins. A screen of crowns and wilds pays the
            Grand.
          {:else if bonus.kind === 'collect'}
            {bonus.trigger} maps start {bonus.spins} free spins, about once in {Math.round(1 / payback.triggerRate)} spins. Every captain takes
            every doubloon. Every {bonus.perLevel} captains add {bonus.extraSpins} spins and raise the cash to
            {bonus.multipliers.slice(1).join('×, ')}×.
          {:else if bonus.kind === 'wheel'}
            {bonus.trigger} tickets spin the wheel, about once in {Math.round(1 / payback.triggerRate)} spins. Up climbs to the next wheel in:
            1 in {Math.round(1 / payback.levelRates[1]!)} reach the middle wheel, 1 in {Math.round(1 / payback.levelRates[2]!)} the crown wheel.
          {:else}
            {bonus.trigger} lanterns start the pick, about once in {Math.round(1 / payback.triggerRate)} spins. Pick until three of one jackpot
            show.
          {/if}
        </p>
        {#if pots.length}
          <p class="note">
            Gems on the {carriers} fill the pots, which keep what they hold from spin to spin at any bet. Every full pot joins the next
            {bonusName(machine).toLowerCase()}:
            {pots.map((p, i) => `${p.name} (${powerText(p.power, machine).toLowerCase()}) ${Math.round(payback.potRates[i]! * 100)}% of the time`).join(', ')}.
            All three, the Super, comes about once in {Math.round(1 / payback.superRate)} bonuses.
          </p>
        {/if}
        <dl>
          {#each JACKPOT_ROWS as j (j.tier)}
            <dt>{j.name}{j.tier === 'grand' || j.tier === 'major' ? ' · linked' : ''}</dt>
            <dd>{formatMoney(j.amount)}</dd>
          {/each}
        </dl>
      </section>
      <section class="panel">
        <h2>Recent jackpots <span>across the floor</span></h2>
        {#if jackpots.history.length}
          <ul class="hits">
            {#each jackpots.history as h (h.at)}
              <li>
                <b class={h.tier}>{h.mystery ? 'Must-hit Major' : h.tier === 'grand' ? 'Grand' : 'Major'}</b>
                <span>{formatMoney(new Decimal(h.paid))}</span>
                <span class="muted">{ago(h.at)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="note">None yet. The Major must hit before {formatLimit(game.bet.mul(MAJOR_CAP))} at this bet.</p>
        {/if}
      </section>
      <section class="panel">
        <h2>Payback</h2>
        <p class="note">
          {(live.total * 100).toFixed(1)}% with the progressives as they stand: ways {(live.ways * 100).toFixed(1)}%{#if live.collect}, captain
            {(live.collect * 100).toFixed(1)}%{/if}, {bonusName(machine).toLowerCase()}
          {(live.feature * 100).toFixed(1)}%. Exact, from the reel strips.
        </p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

{#snippet tile()}
  <!-- An empty cell in the bonus: a dark vault panel with the machine's dial on it. -->
  <span class="tile" aria-hidden="true">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="26" />
      <circle cx="50" cy="50" r="8" />
      {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
        <line x1="50" y1="50" x2={50 + 34 * Math.cos((a * Math.PI) / 180)} y2={50 + 34 * Math.sin((a * Math.PI) / 180)} />
      {/each}
    </svg>
  </span>
{/snippet}

<style>
  /*
   * Each machine's look: its bulbs, the colour its wins glow, its bezel and its
   * lettering. The cabinet body and backdrop are in cabinets.css.
   */
  .cabinet {
    --logo-h: clamp(30px, 5.5cqh, 46px);
    --cell: clamp(40px, min(calc((100cqw - 66px) / 5.1), calc((100cqh - 164px - var(--logo-h)) / 3.2)), 150px);
    --bulb-a: #ffd75e;
    --bulb-b: #fff4d6;
    --win: #ffd75e;
    --logo-font: var(--font-display);
    --bezel: linear-gradient(145deg, #fff0b0, #c99a38 30%, #7a5418 55%, #e8c063 80%, #8a6420);
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    justify-items: center;
    align-items: center;
    gap: 8px;
    height: 100%;
  }
  /* A row of pots under the marquee takes some of the height from the reels. */
  .cabinet.has-pots {
    --cell: clamp(40px, min(calc((100cqw - 66px) / 5.1), calc((100cqh - 216px - var(--logo-h)) / 3.2)), 150px);
    grid-template-rows: auto auto auto 1fr auto;
    gap: 7px;
  }
  .cabinet > :global(*:not(.scene)) {
    position: relative;
    z-index: 1;
  }
  .cabinet.vault {
    --logo-font: 'Limelight', var(--font-display);
  }
  .cabinet.forge {
    --bulb-a: #ffb347;
    --bulb-b: #ff5a1f;
    --win: #ff9a3c;
    --logo-font: 'Metal Mania', var(--font-display);
    --bezel:
      radial-gradient(circle, #8a7a70 0 2px, transparent 2.5px) 0 0 / 22px 22px,
      linear-gradient(145deg, #4a3a32, #1e1612 40%, #3a2c25 70%, #120c09);
  }
  .cabinet.haul {
    --bulb-a: #4cc9b0;
    --bulb-b: #e8b84a;
    --win: #5fe0c4;
    --logo-font: 'Pirata One', var(--font-display);
    --bezel:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 30px),
      linear-gradient(#7a4d27, #4f2f15 50%, #6b4220);
  }
  .cabinet.carnival {
    --bulb-a: #fff3b0;
    --bulb-b: #ff4d6a;
    --win: #ffe066;
    --logo-font: 'Rye', var(--font-display);
    --bezel: repeating-linear-gradient(135deg, #e8344f 0 14px, #fff4d6 14px 28px);
  }
  .cabinet.lanterns {
    --bulb-a: #ffc04a;
    --bulb-b: #ff5a5a;
    --win: #ffc04a;
    --logo-font: 'Kaushan Script', var(--font-display);
    --bezel:
      repeating-linear-gradient(90deg, transparent 0 10px, rgb(255 192 74 / 0.35) 10px 12px),
      linear-gradient(#b51d33, #7a0f22 50%, #9c1529);
  }
  /* The bezel: a thick frame round the screen, its bulbs set in it. */
  .bezel {
    position: relative;
    padding: 15px;
    border-radius: 22px;
    background: var(--bezel);
    box-shadow:
      0 8px 24px rgb(0 0 0 / 0.6),
      inset 0 1px 0 rgb(255 255 255 / 0.35),
      inset 0 -2px 0 rgb(0 0 0 / 0.35),
      0 0 0 1px rgb(0 0 0 / 0.6);
  }
  .in-feature .bezel,
  .triggering .bezel {
    box-shadow:
      0 8px 24px rgb(0 0 0 / 0.6),
      0 0 34px color-mix(in srgb, var(--win) 55%, transparent),
      inset 0 1px 0 rgb(255 255 255 / 0.35),
      0 0 0 1px rgb(0 0 0 / 0.6);
  }
  /* A big win shakes the machine. */
  .shake .bezel {
    animation: shake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
  @keyframes shake {
    15%,
    55% {
      translate: -5px 1px;
    }
    35%,
    75% {
      translate: 5px -1px;
    }
    90% {
      translate: -2px 0;
    }
  }
  .pots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    width: min(100%, max(calc(var(--cell) * 5.4), 380px));
  }
  .pot {
    --tint: #5fe08a;
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 7px;
    padding: 5px 8px 5px 6px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.45);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 40%, transparent);
    min-width: 0;
    transition: box-shadow 0.3s;
  }
  .pot.r1 {
    --tint: #5cc8ff;
  }
  .pot.r2 {
    --tint: #d08cff;
  }
  .pot.full {
    box-shadow:
      inset 0 0 0 1px var(--tint),
      0 0 14px color-mix(in srgb, var(--tint) 45%, transparent);
    animation: pot-ready 1.1s ease-in-out infinite alternate;
  }
  .pot.in-play {
    animation: none;
    background: color-mix(in srgb, var(--tint) 22%, rgb(0 0 0 / 0.5));
    box-shadow:
      inset 0 0 0 2px var(--tint),
      0 0 20px color-mix(in srgb, var(--tint) 60%, transparent);
  }
  .pots.super .pot.in-play {
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 22px rgb(255 215 94 / 0.7);
  }
  @keyframes pot-ready {
    to {
      box-shadow:
        inset 0 0 0 1px var(--tint),
        0 0 22px color-mix(in srgb, var(--tint) 70%, transparent);
    }
  }
  /* The jar: it fills from the bottom, gem by gem. */
  .jar {
    position: relative;
    grid-row: span 2;
    width: 20px;
    height: 28px;
    border-radius: 5px 5px 9px 9px;
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tint) 70%, transparent);
    overflow: hidden;
  }
  .jar i {
    position: absolute;
    inset: auto 0 0;
    height: var(--fill);
    background: linear-gradient(color-mix(in srgb, var(--tint) 100%, #fff 25%), var(--tint));
    transition: height 0.45s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .plink {
    position: absolute;
    inset: 0;
    background: #fff;
    animation: plink 0.5s ease-out forwards;
  }
  @keyframes plink {
    from {
      opacity: 0.7;
    }
    to {
      opacity: 0;
    }
  }
  .pot-text {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }
  .pot-text b {
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .pot-text small {
    font: 700 11px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    color: #fff;
    white-space: nowrap;
  }
  .power {
    font: 500 10px/1.15 var(--font-ui);
    color: rgb(255 255 255 / 0.62);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (max-width: 520px) {
    .pot {
      padding: 4px 6px 4px 5px;
      column-gap: 5px;
    }
    .jar {
      grid-row: auto;
      width: 14px;
      height: 22px;
    }
    .pot-text {
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
    }
    .pot-text b {
      font-size: 9px;
      letter-spacing: 0.08em;
    }
    .power {
      display: none;
    }
  }
  /* A pot's gem on a coin in the base game. */
  .gem {
    --tint: #5fe08a;
    position: absolute;
    top: 6%;
    right: 8%;
    width: 22%;
    aspect-ratio: 1;
    rotate: 45deg;
    border-radius: 3px;
    background: linear-gradient(135deg, #fff, var(--tint) 45%, color-mix(in srgb, var(--tint) 60%, #000));
    box-shadow:
      0 0 0 1.5px rgb(0 0 0 / 0.55),
      0 0 10px var(--tint);
    animation: pop 0.35s cubic-bezier(0.3, 1.6, 0.5, 1);
    pointer-events: none;
  }
  .gem.r1 {
    --tint: #5cc8ff;
  }
  .gem.r2 {
    --tint: #d08cff;
  }
  /* A multiplied wild in free spins: its multiplier in the corner. */
  .wild-x {
    position: absolute;
    top: 5%;
    left: 6%;
    padding: 1px 5px;
    border-radius: 999px;
    background: #ffd75e;
    color: #3a2600;
    font: 800 12px/1.2 var(--font-display);
    box-shadow: 0 0 10px rgb(255 215 94 / 0.7);
    pointer-events: none;
  }
  /* Boost cash on a jackpot coin, under its name. */
  .boosted {
    position: absolute;
    left: 50%;
    bottom: 6%;
    translate: -50% 0;
    padding: 1px 6px;
    border-radius: 999px;
    background: #5fe08a;
    color: #0f2a18;
    font: 700 11px/1.2 var(--font-display);
    white-space: nowrap;
    pointer-events: none;
  }
  .gain.boost {
    background: #5fe08a;
    color: #0f2a18;
  }
  .cell.collected {
    filter: drop-shadow(0 0 14px #d08cff) brightness(1.2);
    animation: glow 0.4s ease-in-out infinite alternate;
  }
  .marquee {
    display: grid;
    grid-template-columns: repeat(var(--plaques, 4), minmax(0, 1fr));
    gap: 6px;
    width: min(100%, max(calc(var(--cell) * 5.4), 380px));
  }
  .plaque {
    --tint: #7ad8ff;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 5px 4px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.45);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 55%, transparent);
    min-width: 0;
  }
  .plaque.minor {
    --tint: #8cf08a;
  }
  .plaque.major {
    --tint: #ff6b8b;
  }
  .plaque.grand {
    --tint: #ffd75e;
  }
  .plaque > span {
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .plaque b {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 clamp(12px, 2.6cqw, 20px) / 1 var(--font-display);
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
  @media (max-width: 520px) {
    .plaque small .wide {
      display: none;
    }
  }
  .plaque small {
    font: 600 9px/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.6);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* How far the Major has climbed toward its must-hit-by amount. */
  .climb {
    width: 80%;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--tint) var(--climb), rgb(255 255 255 / 0.12) var(--climb));
  }
  .plaque.progressive {
    box-shadow:
      inset 0 0 0 1px var(--tint),
      0 0 14px color-mix(in srgb, var(--tint) 30%, transparent);
  }
  /* The glass: five reels in a dark window with a gold frame. */
  .glass {
    position: relative;
    display: grid;
    grid-template-columns: repeat(5, var(--cell));
    gap: 4px;
    padding: 6px;
    border-radius: 14px;
    background: linear-gradient(#0c0716, #1d1230 50%, #0c0716);
    box-shadow:
      0 0 0 3px #b8913a,
      0 0 0 5px #2c2238,
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  /* The glass catches the light, as a real screen does. */
  .glass::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    background:
      linear-gradient(172deg, rgb(255 255 255 / 0.13), rgb(255 255 255 / 0.03) 22%, transparent 40%),
      linear-gradient(transparent 85%, rgb(0 0 0 / 0.25));
    pointer-events: none;
  }
  .in-feature .glass {
    box-shadow:
      0 0 0 3px #ffd75e,
      0 0 0 5px #2c2238,
      0 0 30px rgb(255 215 94 / 0.35),
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  /* Each machine's glass: the forge glows like coals, the sea is deep teal, the big top red, the festival night indigo. */
  .forge .glass {
    background: linear-gradient(#170905, #2e130a 50%, #170905);
    box-shadow:
      0 0 0 3px #c2703a,
      0 0 0 5px #2a160c,
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  .haul .glass {
    background: linear-gradient(#04141a, #0a2a33 50%, #04141a);
    box-shadow:
      0 0 0 3px #4cc9b0,
      0 0 0 5px #0c2228,
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  .carnival .glass {
    background: linear-gradient(#1a0510, #331022 50%, #1a0510);
    box-shadow:
      0 0 0 3px #e8344f,
      0 0 0 5px #2a0c18,
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  .lanterns .glass {
    background: linear-gradient(#070a1e, #141a3a 50%, #070a1e);
    box-shadow:
      0 0 0 3px #ff7a3a,
      0 0 0 5px #1a1230,
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  .in-feature.cabinet .glass {
    box-shadow:
      0 0 0 3px #ffd75e,
      0 0 0 5px #2c2238,
      0 0 30px rgb(255 215 94 / 0.35),
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  /* Free spins: a hammer or captain filling the meter. */
  .cell.mark {
    border-radius: 10px;
    background: rgb(255 176 76 / 0.16);
    box-shadow: inset 0 0 0 2px #ffb04c;
    animation: strike 420ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes strike {
    30% {
      scale: 1.18;
      filter: brightness(1.5) drop-shadow(0 0 12px #ffb04c);
    }
  }
  /* A horseshoe the forge just struck up a tier. */
  .cell.forged {
    border-radius: 10px;
    animation: forge 900ms ease-out;
    box-shadow: inset 0 0 0 2px #ffd75e;
  }
  @keyframes forge {
    from {
      filter: brightness(3) drop-shadow(0 0 18px #ff8a4c);
      scale: 1.2;
    }
  }
  /* A captain collecting: he glows, the doubloons he takes pulse toward him, everything else steps back. */
  .cell.taking {
    position: relative;
    border-radius: 10px;
    box-shadow:
      inset 0 0 0 2px #4cc9b0,
      0 0 18px rgb(76 201 176 / 0.7);
    filter: brightness(1.2);
  }
  .cell.taken {
    animation: pulse 0.45s ease-in-out infinite alternate;
  }
  .banner small {
    font: 600 13px/1.3 var(--font-ui);
    color: #d8c9f2;
    white-space: normal;
    max-width: 280px;
    text-align: center;
  }
  .ladder {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .ladder i {
    position: relative;
    width: 22px;
    height: 22px;
    opacity: 0.55;
  }
  .ladder i.now {
    opacity: 1;
    filter: drop-shadow(0 0 6px #ffb04c);
  }
  .ladder i.gone {
    opacity: 0.25;
  }
  .ladder i.gone::after {
    content: '';
    position: absolute;
    inset: 45% -2px auto;
    height: 2px;
    background: #ff6b8b;
    rotate: -30deg;
  }
  .meter .level {
    padding: 3px 8px;
    border-radius: 6px;
    background: rgb(255 215 94 / 0.15);
    color: #ffd75e;
    letter-spacing: 0.08em;
  }
  /* The wheel bonus: the wheel stands over the reels. */
  .wheel-stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: radial-gradient(circle, rgb(40 10 25 / 0.85), rgb(10 3 8 / 0.95));
    animation: pop 400ms ease-out;
  }
  .wheel {
    /* As tall as the reels, so it sits inside the glass. */
    width: calc(var(--cell) * 3 + 10px);
    height: calc(var(--cell) * 3 + 10px);
    overflow: visible;
    filter: drop-shadow(0 6px 18px rgb(0 0 0 / 0.6));
  }
  .ring {
    transition-property: transform;
    transition-timing-function: cubic-bezier(0.12, 0.62, 0.1, 1);
  }
  .ring.ahead {
    opacity: 0.45;
  }
  .ring:not(.active):not(.ahead) {
    opacity: 0.6;
  }
  .wedge {
    stroke: rgb(0 0 0 / 0.5);
    stroke-width: 0.6;
  }
  .wedge.hit {
    stroke: #fff;
    stroke-width: 2;
    filter: brightness(1.35);
    animation: glow-wedge 0.5s ease-in-out infinite alternate;
  }
  @keyframes glow-wedge {
    to {
      filter: brightness(1.7);
    }
  }
  .wl {
    font-family: var(--font-display);
    font-weight: 700;
    fill: #fff;
    pointer-events: none;
  }
  .wl.dark {
    fill: #2a1745;
  }
  .hub {
    fill: #2a1745;
    stroke: #ffd75e;
    stroke-width: 2;
  }
  .pointer {
    fill: #fff;
    stroke: #2a1745;
    stroke-width: 1.5;
    filter: drop-shadow(0 0 4px #ffd75e);
  }
  /* The jackpot pick: the tally above, the lanterns below. */
  .pick-stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 6px;
    padding: 6px;
    border-radius: 14px;
    background: radial-gradient(circle at 50% 30%, rgb(60 30 70 / 0.92), rgb(7 10 30 / 0.97));
    animation: pop 400ms ease-out;
  }
  .tally {
    display: grid;
    grid-template-columns: repeat(var(--tiers, 4), minmax(0, 1fr));
    gap: 4px;
  }
  .tal {
    --tint: #7ad8ff;
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 4px 2px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.4);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 45%, transparent);
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .tal.minor,
  .lantern.minor {
    --tint: #8cf08a;
  }
  .tal.major,
  .lantern.major {
    --tint: #ff6b8b;
  }
  .tal.grand,
  .lantern.grand {
    --tint: #ffd75e;
  }
  .tal.close {
    animation: glow 0.5s ease-in-out infinite alternate;
  }
  .tal.won {
    background: var(--tint);
    color: #2a1745;
  }
  .pips {
    display: inline-flex;
    gap: 3px;
  }
  .pips i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.15);
  }
  .pips i.on {
    background: var(--tint);
    box-shadow: 0 0 6px var(--tint);
  }
  .tal.won .pips i.on {
    background: #2a1745;
    box-shadow: none;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 5px;
    min-height: 0;
  }
  .lantern {
    --tint: #7ad8ff;
    display: grid;
    place-items: center;
    min-height: 0;
    padding: 3px;
    border: 0;
    border-radius: 10px;
    background: rgb(255 255 255 / 0.05);
    box-shadow: none;
    cursor: default;
  }
  .lantern {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .lantern :global(svg) {
    position: absolute;
    inset: 6%;
    width: 88%;
    height: 88%;
  }
  .waiting .lantern:not(.open) {
    cursor: pointer;
    animation: sway 1.6s ease-in-out infinite alternate;
  }
  .waiting .lantern:not(.open):hover {
    background: rgb(255 215 94 / 0.14);
    filter: brightness(1.25) drop-shadow(0 0 10px #ff7a3a);
  }
  @keyframes sway {
    from {
      rotate: -3deg;
    }
    to {
      rotate: 3deg;
    }
  }
  .lantern.open {
    background: rgb(0 0 0 / 0.5);
    box-shadow: inset 0 0 0 2px var(--tint);
    animation: drop 320ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .lantern.open b {
    font: 700 clamp(11px, 2.6cqw, 18px) / 1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .lantern.rest {
    opacity: 0.38;
    animation: none;
  }
  .lantern.just {
    box-shadow:
      inset 0 0 0 2px var(--tint),
      0 0 16px var(--tint);
  }
  .lantern.winner {
    background: var(--tint);
    animation: pulse 0.6s ease-in-out infinite alternate;
  }
  .lantern.winner b {
    color: #2a1745;
  }
  .lantern:disabled {
    opacity: 1;
  }
  .lantern.rest:disabled {
    opacity: 0.38;
  }
  /* Each reel a drum: lit across its middle, dark toward the top and bottom, with a metal rail either side. */
  .reel {
    position: relative;
    height: calc(var(--cell) * 3);
    overflow: hidden;
    border-radius: 8px;
    background:
      linear-gradient(rgb(0 0 0 / 0.45), transparent 22%, transparent 78%, rgb(0 0 0 / 0.45)),
      linear-gradient(90deg, rgb(255 255 255 / 0.03), rgb(255 255 255 / 0.09) 50%, rgb(255 255 255 / 0.03));
    box-shadow:
      -2px 0 0 color-mix(in srgb, var(--bulb-a) 35%, #000),
      2px 0 0 color-mix(in srgb, var(--bulb-a) 35%, #000);
  }
  .reel.slow {
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 16px rgb(255 215 94 / 0.6);
    animation: glow 0.5s ease-in-out infinite alternate;
  }
  /* A charm's nudge: the reel slides one step, overshoots and settles. */
  .reel.nudge-down > .cell {
    animation: nudge-down 0.55s cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .reel.nudge-up > .cell {
    animation: nudge-up 0.55s cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .reel.nudge-down,
  .reel.nudge-up {
    box-shadow:
      inset 0 0 0 2px var(--win),
      0 0 22px color-mix(in srgb, var(--win) 70%, transparent);
  }
  @keyframes nudge-down {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes nudge-up {
    from {
      transform: translateY(-100%);
    }
  }
  /* A charm's wild reel: each symbol flips over to a wild, and the reel blazes. */
  .reel.wild-reel {
    background: linear-gradient(#3a1d6e, #6c3fd1 50%, #3a1d6e);
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 26px rgb(208 140 255 / 0.8);
    animation: glow 0.6s ease-in-out infinite alternate;
  }
  .reel.wild-reel > .cell {
    animation: wildflip 0.6s ease-out backwards;
  }
  .reel.wild-reel > .cell:nth-child(2) {
    animation-delay: 0.1s;
  }
  .reel.wild-reel > .cell:nth-child(3) {
    animation-delay: 0.2s;
  }
  @keyframes wildflip {
    from {
      transform: rotateY(90deg) scale(1.3);
      filter: brightness(3);
    }
  }
  @keyframes glow {
    to {
      box-shadow:
        inset 0 0 0 2px #fff1a8,
        0 0 26px rgb(255 215 94 / 0.9);
    }
  }
  .cell {
    position: relative;
    width: var(--cell);
    height: var(--cell);
    padding: 10%;
    transition:
      opacity 200ms ease,
      filter 200ms ease;
  }
  .strip {
    animation: whirl calc(var(--n) * 38ms) linear infinite;
    filter: blur(2.5px) brightness(1.1);
  }
  .reel.slow .strip {
    animation-duration: calc(var(--n) * 110ms);
  }
  @keyframes whirl {
    to {
      transform: translateY(-50%);
    }
  }
  /* A reel stopping overshoots and settles, as a real one does. */
  .land {
    animation: land 260ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes land {
    from {
      transform: translateY(-18%);
    }
  }
  /* The cells of the way being shown: framed in the machine's colour, bouncing, with a shine running over them. */
  .cell.lit {
    z-index: 1;
    overflow: hidden;
    border-radius: 10px;
    background: radial-gradient(circle, color-mix(in srgb, var(--win) 28%, transparent), color-mix(in srgb, var(--win) 8%, transparent) 70%);
    box-shadow:
      inset 0 0 0 2px var(--win),
      0 0 16px color-mix(in srgb, var(--win) 55%, transparent);
    animation: winbounce 0.7s ease-in-out infinite alternate;
  }
  .cell.lit::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 35%, rgb(255 255 255 / 0.45) 50%, transparent 65%) -100% 0 / 220% 100% no-repeat;
    animation: cellshine 1.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes winbounce {
    from {
      scale: 1;
    }
    to {
      scale: 1.07;
      filter: drop-shadow(0 0 10px var(--win)) brightness(1.18);
    }
  }
  @keyframes cellshine {
    to {
      background-position: 200% 0;
    }
  }
  @keyframes pulse {
    to {
      filter: drop-shadow(0 0 10px rgb(255 230 140 / 0.9)) brightness(1.15);
    }
  }
  /* The symbols that started the bonus: they swell and blaze, a ring of light turning behind each. */
  .cell.trigger {
    z-index: 2;
    animation: trigger 0.42s ease-in-out infinite alternate;
  }
  .cell.trigger::before {
    content: '';
    position: absolute;
    inset: -8%;
    z-index: -1;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent, var(--win), transparent 30%, var(--win) 50%, transparent 60%, var(--win) 80%, transparent);
    mask: radial-gradient(circle, transparent 42%, #000 46%, #000 60%, transparent 66%);
    animation: turn 1.2s linear infinite;
  }
  @keyframes trigger {
    from {
      scale: 1.04;
      filter: brightness(1.2) drop-shadow(0 0 8px var(--win));
    }
    to {
      scale: 1.2;
      filter: brightness(1.6) drop-shadow(0 0 20px var(--win));
    }
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  .triggering .cell:not(.trigger) {
    opacity: 0.35;
  }

  /* A big win: the reels darken, the shower falls, and the amount rolls up under a title in the machine's lettering. */
  .bigwin {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 6px;
    border-radius: inherit;
    background: radial-gradient(circle, rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.78));
    animation: fadein 0.25s ease;
    pointer-events: none;
    overflow: hidden;
  }
  .party-back {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  .bw-title {
    position: relative;
    font: 400 min(clamp(30px, 9cqw, 76px), calc(var(--cell) * 0.6)) / 1 var(--logo-font);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: linear-gradient(#fffbe0, var(--win) 45%, color-mix(in srgb, var(--win) 50%, #5a2a00) 60%, #fff3b0);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 3px 0 rgb(0 0 0 / 0.7)) drop-shadow(0 0 18px color-mix(in srgb, var(--win) 70%, transparent));
    animation:
      slam 0.5s cubic-bezier(0.2, 1.8, 0.4, 1),
      throb 0.6s ease-in-out 0.5s infinite alternate;
  }
  .l3 .bw-title,
  .l4 .bw-title {
    font-size: min(clamp(36px, 11cqw, 92px), calc(var(--cell) * 0.72));
  }
  @keyframes slam {
    from {
      scale: 3;
      opacity: 0;
      rotate: -8deg;
    }
  }
  @keyframes throb {
    to {
      scale: 1.06;
    }
  }
  .bw-amount {
    position: relative;
    font: 700 clamp(26px, 6cqw, 52px) / 1 var(--font-display);
    color: #fff;
    font-variant-numeric: tabular-nums;
    text-shadow:
      0 2px 0 rgb(0 0 0 / 0.8),
      0 0 16px color-mix(in srgb, var(--win) 80%, transparent);
  }
  .cell.dim {
    opacity: 0.35;
  }
  /* Hold & spin: empty cells are dark glass; while respinning, they flicker. */
  .cell.hs.empty {
    border-radius: 8px;
    background: radial-gradient(circle, rgb(255 255 255 / 0.05), transparent 70%);
  }
  /* An empty cell's own reel during a respin: coins and blanks blurring by. */
  .cell.hs {
    overflow: hidden;
  }
  .minireel {
    animation: whirl 360ms linear infinite;
    animation-delay: var(--delay);
    filter: blur(1.5px);
  }
  .mini-cell {
    height: calc(var(--cell) * 0.8);
    padding: 4%;
  }
  /* An empty bonus cell: a recessed panel, so the screen reads as a grid of vault doors. */
  .tile {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 10px;
    background: linear-gradient(160deg, #2a1d40, #140c22);
    box-shadow:
      inset 0 0 0 1px rgb(255 215 94 / 0.16),
      inset 0 2px 6px rgb(0 0 0 / 0.6);
  }
  .tile svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: rgb(255 215 94 / 0.22);
    stroke-width: 4;
  }
  /* The reels step back while the bonus win is up. */
  .glass:has(.summary) .reel {
    opacity: 0.4;
    transition: opacity 300ms ease;
  }
  .summary {
    --tint: #ffd75e;
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    z-index: 3;
    display: grid;
    justify-items: center;
    gap: 8px;
    min-width: min(80%, 320px);
    padding: 20px 28px 16px;
    overflow: hidden;
    border-radius: 18px;
    background: rgb(12 7 22 / 0.94);
    box-shadow:
      0 0 0 2px var(--tint),
      0 0 50px color-mix(in srgb, var(--tint) 45%, transparent);
    animation: pop 380ms cubic-bezier(0.3, 1.6, 0.5, 1);
    text-align: center;
  }
  .summary .eyebrow {
    font: 400 clamp(16px, 3cqw, 22px) / 1 var(--logo-font);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .summary b {
    font: 700 clamp(30px, 7cqw, 56px) / 1 var(--font-display);
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .summary .detail {
    font: 13px/1.3 var(--font-ui);
    color: #d8c9f2;
  }
  .summary button {
    margin-top: 6px;
    min-width: 140px;
  }
  /* Time left before it closes on its own. */
  .countdown {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background: var(--tint);
    transform-origin: left;
    animation: countdown var(--ms) linear forwards;
  }
  @keyframes countdown {
    to {
      transform: scaleX(0);
    }
  }
  /* A full screen in reach: these cells glow and turn slowly. */
  .cell.tense {
    border-radius: 10px;
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 18px rgb(255 215 94 / 0.7);
    animation: glow 0.45s ease-in-out infinite alternate;
  }
  .cell.tense .minireel {
    animation-duration: 900ms;
  }
  /* A coin that just landed: it stays lit, its value floating up, until the next respin. */
  .cell.fresh {
    position: relative;
    border-radius: 50%;
    filter: drop-shadow(0 0 14px rgb(255 215 94 / 0.9));
  }
  .gain {
    position: absolute;
    left: 50%;
    top: 4%;
    translate: -50% 0;
    padding: 2px 8px;
    border-radius: 999px;
    background: #ffd75e;
    color: #2a1745;
    font: 700 13px/1.2 var(--font-display);
    white-space: nowrap;
    animation: rise 1.2s ease-out forwards;
    pointer-events: none;
  }
  @keyframes rise {
    from {
      translate: -50% 40%;
      opacity: 0;
    }
    25% {
      opacity: 1;
    }
    to {
      translate: -50% 0;
    }
  }
  /* A bonus cell stopping on nothing settles with a small thud. */
  .cell.hs .tile {
    animation: thud 240ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes thud {
    from {
      transform: translateY(-14%);
    }
  }
  .minireel .tile {
    animation: none;
  }
  /* Between respins: what the last one did. */
  /* Pinned on the reels' top frame, clear of every cell. */
  .respin-note {
    position: absolute;
    left: 50%;
    top: 0;
    translate: -50% -50%;
    z-index: 2;
    padding: 6px 16px;
    border-radius: 999px;
    background: rgb(12 7 22 / 0.9);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.25);
    color: #d8c9f2;
    font: 700 12px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    animation: pop 300ms cubic-bezier(0.3, 1.6, 0.5, 1);
    pointer-events: none;
  }
  .respin-note.good {
    color: #2a1745;
    background: #ffd75e;
    box-shadow: 0 0 24px rgb(255 215 94 / 0.6);
  }
  .respins.flash {
    animation: flash 600ms ease;
  }
  @keyframes flash {
    30% {
      color: #fff;
      text-shadow: 0 0 10px #ffd75e;
      scale: 1.15;
    }
  }
  .prompt {
    color: #ffd75e;
    animation: blink 0.8s ease-in-out infinite alternate;
  }
  @keyframes blink {
    to {
      opacity: 0.45;
    }
  }
  .respin-go {
    animation: beckon 1s ease-in-out infinite;
  }
  @keyframes beckon {
    50% {
      box-shadow: 0 0 22px rgb(255 215 94 / 0.8);
    }
  }
  .last-spin {
    padding: 3px 8px;
    border-radius: 6px;
    background: #ff6b8b;
    color: #1a0b12;
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    animation: glow 0.5s ease-in-out infinite alternate;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 14px/1.3 var(--font-ui);
  }
  .drop {
    width: 100%;
    height: 100%;
    animation: drop 320ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  @keyframes drop {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  .cell.counting {
    filter: drop-shadow(0 0 12px #ffd75e) brightness(1.25);
  }
  .banner {
    --tint: #ffd75e;
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    z-index: 2;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 16px 28px;
    border-radius: 16px;
    background: rgb(12 7 22 / 0.88);
    box-shadow:
      0 0 0 2px var(--tint),
      0 0 40px color-mix(in srgb, var(--tint) 50%, transparent);
    animation: pop 380ms cubic-bezier(0.3, 1.6, 0.5, 1);
    pointer-events: none;
    white-space: nowrap;
  }
  .banner.major {
    --tint: #ff6b8b;
  }
  .banner.minor {
    --tint: #8cf08a;
  }
  .banner b {
    font: 400 clamp(22px, 5cqw, 40px) / 1 var(--logo-font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .banner span {
    font: 700 clamp(18px, 4cqw, 30px) / 1 var(--font-display);
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  @keyframes pop {
    from {
      scale: 0.5;
      opacity: 0;
    }
  }
  .meter {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 6px 14px;
    min-height: 30px;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #c9b7e8;
  }
  .meter b {
    font: 700 26px/1 var(--font-display);
    letter-spacing: 0.02em;
    color: #ffd75e;
    font-variant-numeric: tabular-nums;
  }
  .meter .won {
    animation: pop 300ms ease;
  }
  .quiet {
    color: rgb(201 183 232 / 0.6);
  }
  .respins {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .respins i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.15);
  }
  .respins i.on {
    background: #ffd75e;
    box-shadow: 0 0 6px #ffd75e;
  }
  @media (prefers-reduced-motion: reduce) {
    .strip,
    .cell.lit,
    .reel.slow,
    .minireel,
    .waiting .lantern:not(.open) {
      animation: none;
    }
  }
  /* The spin bar: bet, the big button, the last win. */
  .spinbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .total {
    display: grid;
    gap: 4px;
  }
  .total b {
    font: 700 18px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  /* The deck under the reels: the bet on the left, the meter beside it. */
  .deck {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 14px;
    width: min(100%, max(calc(var(--cell) * 5.4), 380px));
  }
  .bet {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 10px;
    border-radius: 12px;
    background: rgb(0 0 0 / 0.4);
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.45);
  }
  .bet .k {
    color: #c9b7e8;
  }
  .bet .step {
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 20px;
  }
  .bet .amount {
    min-width: 70px;
    height: 36px;
    padding: 0 8px;
    font: 700 19px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    color: #ffd75e;
    background: none;
    border-color: transparent;
  }
  .levels {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px;
    border-radius: 12px;
    background: #160d26;
    box-shadow:
      0 0 0 1px #b8913a,
      0 10px 30px rgb(0 0 0 / 0.6);
  }
  .levels button {
    min-width: 64px;
    padding: 8px 6px;
    font: 700 14px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .levels button[aria-selected='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .meter .way {
    letter-spacing: 0.06em;
    color: #fff1c4;
  }
  .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .spin {
    min-width: 150px;
    min-height: 54px;
    font: 700 20px/1 var(--font-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .last {
    display: grid;
    justify-items: end;
    gap: 4px;
  }
  .last b {
    font: 700 18px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  /* Landscape phones: the bar is a narrow column beside the cabinet, so it stacks. */
  @media (max-height: 520px) and (orientation: landscape) {
    .spinbar {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      align-content: center;
      height: 100%;
      padding: 8px;
    }
    .last {
      justify-items: center;
    }
    .spin {
      min-width: 0;
      width: 100%;
    }
  }
  @media (max-width: 520px) {
    .deck {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      gap: 6px;
    }
    .spinbar {
      grid-template-columns: 1fr auto;
    }
    .last {
      display: none;
    }
    .spin {
      min-width: 120px;
    }
  }
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 8px;
  }
  .panel h2 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .panel h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .pays {
    width: 100%;
    border-collapse: collapse;
    font: 12px/1.2 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .pays th {
    font-weight: 600;
    color: var(--muted);
    text-align: right;
  }
  .pays td {
    text-align: right;
    padding: 2px 0;
  }
  .pays td.art {
    width: 30px;
    height: 30px;
    padding: 1px 0;
  }
  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font: 12px/1.4 var(--font-ui);
  }
  .hits li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    font-variant-numeric: tabular-nums;
  }
  .hits .grand {
    color: #ffd75e;
  }
  .hits .major {
    color: #ff6b8b;
  }
  .muted {
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
    font: 13px/1.4 var(--font-ui);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
