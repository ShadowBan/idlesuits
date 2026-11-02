<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { MACHINES, MIDNIGHT_VAULT, slotPayback, type CoinValue } from '@idlesuits/sim';
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
  import { BET_STEPS, SlotGame, SUMMARY_MS } from './game.svelte';
  import SlotRules from './SlotRules.svelte';
  import SlotSymbol from './SlotSymbol.svelte';

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

  /** What a coin shows: its cash at this bet, or its jackpot. */
  function coinLabel(value: CoinValue, bet: Decimal): string {
    return value.kind === 'cash' ? formatLimit(bet.mul(value.x)) : value.tier.toUpperCase();
  }

  /** A run of each reel's own strip, twice over, for the blur while it spins. */
  const blur = machine.reels.map((strip, r) => {
    const run = Array.from({ length: 8 }, (_, i) => strip[(r * 11 + i * 3) % strip.length]!);
    return [...run, ...run];
  });

  // The progressive meters roll up smoothly as the link feeds them, to the cent.
  const grand = Tween.of(() => jackpots.grand, { duration: 900 });
  const major = Tween.of(() => jackpots.major, { duration: 900 });

  const JACKPOT_ROWS = $derived([
    { tier: 'grand', name: 'Grand', amount: game.bet.mul(grand.current) },
    { tier: 'major', name: 'Major', amount: game.bet.mul(major.current) },
    { tier: 'minor', name: 'Minor', amount: game.bet.mul(machine.jackpots.minor) },
    { tier: 'mini', name: 'Mini', amount: game.bet.mul(machine.jackpots.mini) },
  ] as const);
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
    if (picking) picking = false;
    else if (game.summary) game.dismiss();
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
    if (game.summary) game.dismiss();
    else game.spin();
  }
</script>

<svelte:window onkeydown={onKey} />
<SlotRules bind:this={rules} {machine} {payback} bet={game.bet} waysScale={game.waysScale} />

<TableShell
  machine
  title={[machine.name.split(' ')[0]!, machine.name.split(' ').slice(1).join(' ')]}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={onTap}
>
  {#snippet felt()}
    <div class="cabinet" class:in-feature={game.feature !== null}>
      <!-- The jackpot marquee: the Major and Grand are the casino's linked progressives. -->
      <div class="marquee" aria-label="Jackpots">
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

      <div class="glass" role="img" aria-label="Reels">
        {#each machine.reels as _, r (r)}
          <div class="reel" class:slow={game.anticipating === r}>
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
                >
                  {#if coin}
                    {#key coin}<div class="drop"><SlotSymbol id="coin" coin={coin} label={coinLabel(coin, shownBet)} /></div>{/key}
                    {#if game.feature.fresh.includes(cell)}<span class="gain">{coinLabel(coin, shownBet)}</span>{/if}
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
                <div class="cell land" class:lit={lit.has(`${r}:${row}`)} class:dim={lit.size > 0 && !lit.has(`${r}:${row}`)}>
                  <SlotSymbol {id} {coin} label={coin ? coinLabel(coin, shownBet) : undefined} />
                </div>
              {/each}
            {/if}
          </div>
        {/each}

        {#if game.feature?.note}
          {#key game.feature.note + game.feature.left}
            <div class="respin-note" class:good={game.feature.fresh.length > 0} aria-live="polite">{game.feature.note}</div>
          {/key}
        {/if}

        {#if game.summary}
          {@const sum = game.summary}
          {#key sum.key}
            <!-- The bonus win: up for a few seconds, or until a tap closes it. -->
            <div class="summary" class:grand={sum.full} role="status" style:--ms="{SUMMARY_MS}ms">
              <span class="eyebrow">Hold & spin</span>
              <b>{formatMoney(sum.bonus)}</b>
              <span class="detail">
                {sum.coins} coins{#each sum.jackpots as tier, i (i)} · {tier[0]!.toUpperCase() + tier.slice(1)} jackpot{/each}
              </span>
              {#if !sum.total.eq(sum.bonus)}
                <span class="detail">Total this spin {formatMoney(sum.total)}</span>
              {/if}
              <button type="button" class="primary" onclick={() => game.dismiss()}>Collect</button>
              <i class="countdown" aria-hidden="true"></i>
            </div>
          {/key}
        {/if}

        {#if game.banner}
          {#key game.banner.key}
            <div class="banner {game.banner.tier ?? 'feature'}" aria-live="assertive">
              <b>{game.banner.title}</b>
              {#if game.banner.amount}<span>{formatMoney(game.banner.amount)}</span>{/if}
            </div>
          {/key}
        {/if}
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
                {#each Array.from({ length: machine.holdSpin.respins }, (_, i) => i) as i (i)}
                  <i class:on={i < game.feature.left}></i>
                {/each}
              </span>
            {/key}
            {#if game.feature.last}<span class="last-spin">Last spin</span>{/if}
            {#if seq.awaiting === 'respin'}<span class="prompt">Press Respin</span>{/if}
            <span>{Object.keys(game.feature.held).length} / {cells}</span>
            <b>{formatMoney(game.feature.collected)}</b>
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
            <span class="quiet">{seq.awaiting === 'spin' ? 'Six coins start hold & spin' : 'Good luck'}</span>
          {/if}
        </div>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Line symbols up from the left reel, 243 ways. Six gold coins start hold & spin, and a full screen cracks the Grand."
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
      {:else if game.autoPlay && game.started}
        <button type="button" class="spin" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
      {:else if game.summary}
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
        ['Hold & spins', String(game.features)],
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
          <p class="note">Hold & spin plays out in full even when the deal speed is faster. Off, it follows the deal speed.</p>
          <label class="switch">
            <input type="checkbox" checked={game.bonusControl} onchange={(e) => game.setBonusControl(e.currentTarget.checked)} />
            Play the bonus yourself
          </label>
          <p class="note">
            Hold & spin stops and waits for you to start each respin, even in auto play, which carries on once you collect. Off,
            it plays itself, for running unattended.
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
        <p class="note">Wilds on reels 2–4 stand in for every symbol but the coin.</p>
      </section>
      <section class="panel">
        <h2>Hold & spin</h2>
        <p class="note">
          {machine.holdSpin.trigger}+ coins start it, about once in {Math.round(1 / payback.triggerRate)} spins. Coins stick, each new one resets
          the {machine.holdSpin.respins} respins, and a full screen pays the Grand on top.
        </p>
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
          {(live.total * 100).toFixed(1)}% with the progressives as they stand: ways {(live.ways * 100).toFixed(1)}%, hold & spin
          {((live.total - live.ways) * 100).toFixed(1)}%. Exact, from the reel strips.
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
  .cabinet {
    --cell: clamp(40px, min(calc((100cqw - 34px) / 5.1), calc((100cqh - 125px) / 3.2)), 150px);
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    align-items: center;
    gap: 10px;
    height: 100%;
  }
  .marquee {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
  .in-feature .glass {
    box-shadow:
      0 0 0 3px #ffd75e,
      0 0 0 5px #2c2238,
      0 0 30px rgb(255 215 94 / 0.35),
      inset 0 0 22px rgb(0 0 0 / 0.8);
  }
  .reel {
    height: calc(var(--cell) * 3);
    overflow: hidden;
    border-radius: 8px;
    background: linear-gradient(90deg, rgb(255 255 255 / 0.03), rgb(255 255 255 / 0.08) 50%, rgb(255 255 255 / 0.03));
  }
  .reel.slow {
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 16px rgb(255 215 94 / 0.6);
    animation: glow 0.5s ease-in-out infinite alternate;
  }
  @keyframes glow {
    to {
      box-shadow:
        inset 0 0 0 2px #fff1a8,
        0 0 26px rgb(255 215 94 / 0.9);
    }
  }
  .cell {
    width: var(--cell);
    height: var(--cell);
    padding: 10%;
    transition:
      opacity 200ms ease,
      filter 200ms ease;
  }
  .strip {
    animation: whirl calc(var(--n) * 45ms) linear infinite;
    filter: blur(1.5px);
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
  /* The cells of the way being shown: framed in gold. */
  .cell.lit {
    border-radius: 8px;
    background: rgb(255 215 94 / 0.12);
    box-shadow: inset 0 0 0 2px #ffd75e;
    animation: pulse 0.7s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      filter: drop-shadow(0 0 10px rgb(255 230 140 / 0.9)) brightness(1.15);
    }
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
    font: 700 13px/1 var(--font-ui);
    letter-spacing: 0.2em;
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
    font: 700 clamp(22px, 5cqw, 40px) / 1 var(--font-display);
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
    .minireel {
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
