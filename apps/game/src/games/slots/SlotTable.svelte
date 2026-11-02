<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MACHINES, MIDNIGHT_VAULT, slotPayback, type CoinValue } from '@idlesuits/sim';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { floor } from '../../lib/floor.svelte';
  import { jackpots } from '../../lib/jackpot.svelte';
  import { formatMoney, type Decimal } from '../../lib/money';
  import { formatLimit } from '../../lib/rooms';
  import { route } from '../../lib/route.svelte';
  import { unlockAudio } from '../../lib/sound';
  import { BET_STEPS, SlotGame } from './game.svelte';
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

  const JACKPOT_ROWS = $derived([
    { tier: 'grand', name: 'Grand', amount: game.bet.mul(jackpots.grand) },
    { tier: 'major', name: 'Major', amount: game.bet.mul(jackpots.major) },
    { tier: 'minor', name: 'Minor', amount: game.bet.mul(machine.jackpots.minor) },
    { tier: 'mini', name: 'Mini', amount: game.bet.mul(machine.jackpots.mini) },
  ] as const);

  const shownBet = $derived(seq.awaiting === 'spin' || !game.roundBet.gt(0) ? game.bet : game.roundBet);
  const lit = $derived(new Set(game.lit));

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
    game.spin();
  }
</script>

<svelte:window onkeydown={onKey} />
<SlotRules bind:this={rules} {machine} {payback} />

<TableShell
  machine
  title={[machine.name.split(' ')[0]!, machine.name.split(' ').slice(1).join(' ')]}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => game.spin()}
>
  {#snippet felt()}
    <div class="cabinet" class:in-feature={game.feature !== null}>
      <!-- The jackpot marquee: the Major and Grand are the casino's linked progressives. -->
      <div class="marquee" aria-label="Jackpots">
        {#each JACKPOT_ROWS as j (j.tier)}
          <div class="plaque {j.tier}" class:progressive={j.tier === 'grand' || j.tier === 'major'}>
            <span>{j.name}</span>
            <b>{formatMoney(j.amount)}</b>
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
                <div class="cell hs" class:counting={game.feature.counting === cell} class:empty={!coin} class:whirl={!coin && game.feature.spinning}>
                  {#if coin}
                    {#key coin}<div class="drop"><SlotSymbol id="coin" coin={coin} label={coinLabel(coin, shownBet)} /></div>{/key}
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

        {#if game.banner}
          {#key game.banner.key}
            <div class="banner {game.banner.tier ?? 'feature'}" aria-live="assertive">
              <b>{game.banner.title}</b>
              {#if game.banner.amount}<span>{formatMoney(game.banner.amount)}</span>{/if}
            </div>
          {/key}
        {/if}
      </div>

      <!-- The meter under the reels: the win, or how the feature is going. -->
      <div class="meter" aria-live="polite">
        {#if game.feature && !game.feature.done}
          <span class="respins" aria-label="{game.feature.left} respins left">
            Respins
            {#each Array.from({ length: machine.holdSpin.respins }, (_, i) => i) as i (i)}
              <i class:on={i < game.feature.left}></i>
            {/each}
          </span>
          <span>{Object.keys(game.feature.held).length} / {cells} coins</span>
          <b>{formatMoney(game.feature.collected)}</b>
        {:else if game.win}
          <span>Win</span>
          <b class="won">{formatMoney(game.win)}</b>
        {:else}
          <span class="quiet">{seq.awaiting === 'spin' ? 'Six coins start hold & spin' : 'Good luck'}</span>
        {/if}
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
      <div class="bet" role="group" aria-label="Bet">
        <span class="k">Bet</span>
        <button type="button" aria-label="Lower bet" onclick={() => game.setStep(game.step - 1)} disabled={game.step === 0}>−</button>
        <b>{formatMoney(game.bet)}</b>
        <button
          type="button"
          aria-label="Raise bet"
          onclick={() => game.setStep(game.step + 1)}
          disabled={!nextBet || game.bank.lt(nextBet)}
        >+</button>
      </div>
      {#if game.autoPlay && game.started}
        <button type="button" class="spin" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
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
        <h2>Payback</h2>
        <p class="note">
          {(live.total * 100).toFixed(1)}% with the progressives as they stand: ways {(live.ways * 100).toFixed(1)}%, hold & spin
          {((live.total - live.ways) * 100).toFixed(1)}%. Exact, from the reel strips.
        </p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

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
  .plaque span {
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
  .cell.lit {
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
  .cell.whirl {
    background: repeating-linear-gradient(180deg, rgb(255 215 94 / 0.18) 0 8%, transparent 8% 22%);
    background-size: 100% 200%;
    animation: flicker 160ms linear infinite;
  }
  @keyframes flicker {
    to {
      background-position: 0 100%;
    }
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
    align-items: baseline;
    justify-content: center;
    gap: 14px;
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
    .cell.whirl {
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
  .bet {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bet b {
    min-width: 64px;
    text-align: center;
    font: 700 20px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .bet button {
    width: 40px;
    height: 40px;
    padding: 0;
    font-size: 20px;
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
