<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    CART_BOOSTS,
    CART_MEAN,
    CART_TRACKS,
    cartsFor,
    MINES_MAX_BOMBS,
    MINES_TILES,
    minesAverage,
    minesCashout,
    minesSurvival,
    starsFor,
    VAULT_FULL,
    VAULT_PICKS,
    VAULT_SHARE,
  } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { MinesGame } from './mines.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new MinesGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  const tiles = Array.from({ length: MINES_TILES }, (_, i) => i);
  const stars = $derived(starsFor(game.bombs));
  const carts = $derived(cartsFor(game.bombs));
  const gems = $derived(MINES_TILES - game.bombs - stars - carts);
  const live = $derived(game.live);
  const st = $derived(game.state);
  const bet = $derived(live?.bet ?? game.bet);
  /** The cash-out the next find would make, from where the round stands (or from the start). */
  const base = $derived(live && game.found.length ? st.value : game.rtp);
  const nextGem = $derived(bet.mul(base * st.gem));
  const nextStar = $derived(bet.mul(base * st.star));
  const firstGem = $derived(game.bet.mul(minesCashout(game.bombs, [{ tile: 'gem' }], game.rtp)));
  const odds = $derived([1, 3, 5, 10].filter((k) => k <= MINES_TILES - game.bombs).map((k) => ({ k, p: minesSurvival(game.bombs, k) })));

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside, button')) return;
    if (e.key === 'ArrowUp' && !live) return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown' && !live) return game.setStep(game.step - 1);
    if (e.key === 'r') return game.digRandom();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (game.ride?.done) game.endRide();
    else if (game.bonus?.done) game.closeBonus();
    else if (live && game.found.length) game.cashOut();
    else if (!live && !game.busy) game.begin();
  }

  function begin() {
    unlockAudio();
    game.start();
  }

  const fmtShare = (x: number) => `${Math.round(x * 100)}%`;
  /** The fewest sticks that bring a mine cart. */
  const firstCart = Array.from({ length: MINES_MAX_BOMBS }, (_, i) => i + 1).find((b) => cartsFor(b) > 0) ?? 2;
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Bury the dynamite', demo: '1–24', text: 'Choose how many sticks go under the 25 squares. More dynamite, bigger finds.' },
    { title: 'Dig', demo: '◆ ★ ⛏', text: 'Gems raise the cash-out, stars twice as much, and a mine cart takes a ride that multiplies it.' },
    { title: 'Cash out', demo: '$', text: 'Take the money after any dig. Hit dynamite and the bet is lost.' },
  ]}
>
  {#snippet goal()}
    Dig up gems without hitting the dynamite, cash out before your luck runs out, and fill the Gem Vault for a bonus board.
  {/snippet}
  <details open>
    <summary>Gems, stars and the mine cart</summary>
    <ul>
      <li>
        The board is dealt when you stake the bet, from the round's seed: {game.bombs} sticks of dynamite, {stars}
        {stars === 1 ? 'star' : 'stars'}{carts ? ', a mine cart' : ''} and {gems} gems. It never changes while you dig.
      </li>
      <li>A star raises the cash-out twice as much as a gem. Stars come with more dynamite: one for every three sticks, up to two.</li>
      <li>
        <b>The mine cart</b> (on boards with {firstCart} or more sticks) rides {CART_BOOSTS.length} junctions. At each, pick one of
        {CART_TRACKS} tunnels: one has caved in and ends the ride, the others add to its multiplier
        ({CART_BOOSTS.map((b) => `+${b}`).join(', ')}). The ride's multiplier, ×{CART_MEAN.toFixed(2)} on average, then goes on your
        cash-out, and you keep digging.
      </li>
      <li>Find every safe square and the game cashes out for you.</li>
    </ul>
  </details>
  <details>
    <summary>The Gem Vault</summary>
    <ul>
      <li>
        Every find, whatever it is, drops {(VAULT_SHARE * game.rtp * 100).toFixed(1)}% of your bet into the vault. The vault keeps it
        from round to round, whatever happens to the round, and whatever you bet next.
      </li>
      <li>
        After {VAULT_FULL} finds it opens: a free bonus board of 25 squares, all safe, each hiding a share of the vault. Pick
        {VAULT_PICKS}; it pays what you uncover, on average the whole vault, and up to nearly three times it.
      </li>
    </ul>
  </details>
  <details>
    <summary>Why it's fair</summary>
    <ul>
      <li>
        Every dig is priced from what's left on the board: what the cash-out will be after it, plus what it drops in the vault, is
        worth on average exactly what the cash-out is now. The house takes its cut once, up front.
      </li>
      <li>So the game pays back {(game.rtp * 100).toFixed(1)}% however many squares you dig, which ones, and whenever you cash out.</li>
      {#each odds as o (o.k)}
        <li>With {game.bombs} {game.bombs === 1 ? 'stick' : 'sticks'}: {o.k} safe {o.k === 1 ? 'dig' : 'digs'} in a row, {(o.p * 100).toFixed(o.p < 0.01 ? 2 : 1)}%.</li>
      {/each}
    </ul>
  </details>
</RulesFrame>

<TableShell
  machine
  cabinet="mines"
  title={['Dynamite', 'Dig']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
>
  {#snippet felt()}
    <div class="stage mines-stage" class:blast={game.ended?.how === 'boom'}>
      <div class="top">
        <!-- The cash-out and what the next dig can do. -->
        <div class="readout" aria-live="polite">
          {#if live}
            <span class="k">Cash-out</span>
            <b>{game.found.length ? formatMoney(live.bet.mul(game.cashout)) : '—'}</b>
            <span class="next">
              <span title="A gem"><i class="mini gem"></i>{formatMoney(nextGem)}</span>
              {#if st.starsLeft}<span title="A star"><i class="mini star"></i>{formatMoney(nextStar)}</span>{/if}
              {#if st.cartsLeft}<span title="The mine cart, on average"><i class="mini cart"></i>×{CART_MEAN.toFixed(1)}</span>{/if}
              <span class="risk" title="Dynamite"><i class="mini boom"></i>{(st.bomb * 100).toFixed(0)}%</span>
            </span>
          {:else if game.ended}
            {#key game.ended}
              <span class="k">{game.ended.how === 'boom' ? 'Boom!' : 'Cashed out'}</span>
              <b class="result {game.ended.how}">{game.ended.how === 'boom' ? 'Dynamite' : formatMoney(game.ended.pay)}</b>
              <span class="hint">Pick a square to dig again</span>
            {/key}
          {:else}
            <span class="k">First gem pays</span>
            <b>{formatMoney(firstGem)}</b>
            <span class="hint">Pick a square to start</span>
          {/if}
        </div>
        <!-- The Gem Vault: cash set aside by every find, open once full. -->
        {#key game.drops}
          <div class="vault" class:full={game.vaultFinds >= VAULT_FULL} class:drop={game.drops > 0} title="Every find drops cash in the vault; {VAULT_FULL} finds open its bonus board">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <rect x="4" y="6" width="40" height="36" rx="5" fill="#3a3f4a" stroke="#14161b" stroke-width="2.5" />
              <circle cx="24" cy="24" r="10" fill="#6b7280" stroke="#14161b" stroke-width="2" />
              <path d="M24 16v16M16 24h16" stroke="#14161b" stroke-width="2" />
              <rect x="8" y="10" width="4" height="8" rx="1" fill="#14161b" />
            </svg>
            <span class="vtext">
              <b>Gem Vault</b>
              <span>{formatMoney(game.vaultCash)}</span>
            </span>
            <span class="vbar"><i style:width="{(game.vaultFinds / VAULT_FULL) * 100}%"></i></span>
            <small>{game.vaultFinds} / {VAULT_FULL}</small>
          </div>
        {/key}
      </div>

      <div class="field" class:live={!!live || (!game.busy && game.canBet)} class:boom={game.ended?.how === 'boom'} role="grid" aria-label="Dig site">
        {#each tiles as i (i)}
          {@const dug = game.dug[i]}
          {@const shown = dug ?? (game.shown && game.board ? game.board[i] : undefined)}
          <button
            type="button"
            class="square {shown ?? ''}"
            class:open={shown !== undefined}
            class:dug={dug !== undefined}
            class:hit={game.ended?.at === i}
            disabled={game.busy || game.autoPlay || (live ? dug !== undefined : !game.canBet)}
            aria-label={shown ? shown : `Square ${i + 1}`}
            onclick={() => game.dig(i)}
          >
            {#if dug !== undefined}<span class="puff" aria-hidden="true"></span>{/if}
            {#if shown === 'gem'}
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M14 22l8-10h20l8 10-18 30z" fill="#5fd0ff" stroke="#0d3a52" stroke-width="2.5" stroke-linejoin="round" />
                <path d="M14 22h36M22 12l6 10 4 30 4-30 6-10M28 22h8" fill="none" stroke="#0d3a52" stroke-width="1.6" stroke-linejoin="round" />
                <path d="M20 20l4-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8" />
              </svg>
            {:else if shown === 'star'}
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 6l7.6 16 17.4 2.3-12.8 12 3.2 17.3L32 45.2l-15.4 8.4 3.2-17.3L7 24.3 24.4 22z" fill="#ffd75e" stroke="#7a4f0c" stroke-width="2.5" stroke-linejoin="round" />
                <text x="32" y="38" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="13" fill="#7a4f0c">×2</text>
              </svg>
            {:else if shown === 'cart'}
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M8 26h48l-6 18H14z" fill="#8a5a34" stroke="#2b1709" stroke-width="2.5" stroke-linejoin="round" />
                <path d="M12 26l3-8h34l3 8" fill="#c48a3a" stroke="#2b1709" stroke-width="2.5" stroke-linejoin="round" />
                <path d="M20 22l4-6M30 22l2-7M40 22l-2-6" stroke="#5fd0ff" stroke-width="4" stroke-linecap="round" />
                <circle cx="20" cy="48" r="6" fill="#4a4f5a" stroke="#14161b" stroke-width="2.5" />
                <circle cx="44" cy="48" r="6" fill="#4a4f5a" stroke="#14161b" stroke-width="2.5" />
                <path d="M4 56h56" stroke="#6b5a4a" stroke-width="3" />
              </svg>
            {:else if shown === 'bomb'}
              <svg viewBox="0 0 64 64" aria-hidden="true">
                {#if game.ended?.at === i}
                  <path d="M32 4l6 14 14-8-6 15 15 3-13 8 10 12-15-3-1 15-10-12-10 12-1-15-15 3 10-12-13-8 15-3-6-15 14 8z" fill="#ff9a3c" stroke="#7a2a06" stroke-width="2" stroke-linejoin="round" />
                  <circle cx="32" cy="33" r="9" fill="#fff3b0" />
                {:else}
                  <g transform="rotate(-18 32 36)">
                    <rect x="16" y="22" width="10" height="30" rx="3" fill="#d93a32" stroke="#4a0d0a" stroke-width="2.2" />
                    <rect x="27" y="22" width="10" height="30" rx="3" fill="#e8453a" stroke="#4a0d0a" stroke-width="2.2" />
                    <rect x="38" y="22" width="10" height="30" rx="3" fill="#d93a32" stroke="#4a0d0a" stroke-width="2.2" />
                    <rect x="14" y="32" width="36" height="6" fill="#3a2a20" />
                    <path d="M32 22c0-6 4-8 8-10" fill="none" stroke="#3a2a20" stroke-width="2" />
                    <circle cx="41" cy="11" r="3" fill="#ffd75e" />
                  </g>
                {/if}
              </svg>
            {:else}
              <!-- A packed-earth square, cracked: a different crack for every square. -->
              <svg class="rock" viewBox="0 0 64 64" aria-hidden="true">
                <path d={['M10 20l12 6 6-8 10 10', 'M50 14l-8 10 6 8-10 6', 'M14 46l10-6 8 6 12-4', 'M40 50l-6-10 8-8'][i % 4]} fill="none" stroke="rgb(0 0 0 / 0.35)" stroke-width="2" stroke-linecap="round" />
              </svg>
            {/if}
          </button>
        {/each}

        {#if game.ride}
          {@const ride = game.ride}
          <!-- The mine cart's ride: a junction at a time, one tunnel caved in. -->
          <div class="overlay ride" role="dialog" aria-label="Mine cart ride">
            <h3>Mine cart ride <b>×{ride.x.toFixed(ride.x % 1 ? 1 : 0)}</b></h3>
            <ol class="junctions">
              {#each CART_BOOSTS as boost, j (j)}
                <li class:now={j === ride.picks.length && !ride.done} class:past={j < ride.picks.length}>+{boost}</li>
              {/each}
            </ol>
            {#if !ride.done}
              <p>Junction {ride.picks.length + 1}: pick a tunnel. One has caved in.</p>
              <div class="tunnels">
                {#each Array.from({ length: CART_TRACKS }, (_, t) => t) as t (t)}
                  <button type="button" class="tunnel" onclick={() => game.takeTrack(t)} aria-label="Tunnel {t + 1}">
                    <svg viewBox="0 0 80 70" aria-hidden="true">
                      <path d="M6 70V34a34 34 0 0 1 68 0v36z" fill="#120c08" stroke="#6b4a2a" stroke-width="5" />
                      <path d="M24 70l8-30h16l8 30" fill="none" stroke="#8a7a6a" stroke-width="3" />
                      <path d="M28 56h24M30 46h20" stroke="#8a7a6a" stroke-width="2" />
                    </svg>
                    <span>+{CART_BOOSTS[ride.picks.length]}</span>
                  </button>
                {/each}
              </div>
            {:else}
              {#key ride.picks.length}
                <p class="verdict" class:caved={ride.caved}>
                  {ride.caved ? 'Cave-in! The ride stops here.' : 'Through every junction!'} Your cash-out is multiplied by ×{ride.x.toFixed(ride.x % 1 ? 1 : 0)}.
                </p>
              {/key}
              <button type="button" class="primary" onclick={() => game.endRide()}>Keep digging</button>
            {/if}
          </div>
        {/if}

        {#if game.bonus}
          {@const b = game.bonus}
          <!-- The Gem Vault's bonus board: every square safe, each a share of the vault. -->
          <div class="overlay vaultboard" role="dialog" aria-label="Gem Vault bonus">
            <h3>Gem Vault open! <b>{formatMoney(b.cash.mul(game.bonusShare))}</b></h3>
            <p>{b.done ? `You found ${fmtShare(game.bonusShare)} of the vault's ${formatMoney(b.cash)}.` : `Pick ${VAULT_PICKS - b.picked.length} more: each square holds a share of ${formatMoney(b.cash)}.`}</p>
            <div class="vgrid">
              {#each tiles as i (i)}
                {@const open = b.picked.includes(i) || b.done}
                <button type="button" class="vsq" class:open class:mine={b.picked.includes(i)} disabled={open} onclick={() => game.openSquare(i)}>
                  {#if open}{fmtShare(b.squares[i]!)}{:else}◆{/if}
                </button>
              {/each}
            </div>
            {#if b.done}<button type="button" class="primary" onclick={() => game.closeBonus()}>Collect {formatMoney(b.cash.mul(game.bonusShare))}</button>{/if}
          </div>
        {/if}
      </div>

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Bury some dynamite in 25 squares, then dig. Gems raise the cash-out, stars double a gem, a mine cart rides for a multiplier, and every find fills the Gem Vault. Cash out any time; hit the dynamite and the bet is gone."
        hands={game.rounds}
        biggestWin={game.biggestWin}
        onSeat={begin}
        onRules={() => rules?.open()}
        onRestart={() => game.restart()}
      />
    </div>
  {/snippet}

  {#snippet action()}
    <div class="bar">
      {#if live}
        <button type="button" class="ghost" disabled={game.busy} onclick={() => game.digRandom()}>Random square <kbd>R</kbd></button>
        <button type="button" class="go primary" disabled={!game.found.length || game.busy} onclick={() => game.cashOut()}>{game.cashLabel}</button>
        <span class="note">{game.found.length ? `${game.safeLeft} safe squares left` : 'Pick a square to dig'}</span>
      {:else}
        <BetPicker {game} />
        <div class="stepper" role="group" aria-label="Dynamite">
          <span class="k keep">Dynamite</span>
          <button type="button" aria-label="Less dynamite" onclick={() => game.setBombs(game.bombs - 1)} disabled={game.bombs <= 1 || game.busy}>−</button>
          <b>{game.bombs}</b>
          <button type="button" aria-label="More dynamite" onclick={() => game.setBombs(game.bombs + 1)} disabled={game.bombs >= MINES_MAX_BOMBS || game.busy}>+</button>
        </div>
        <button type="button" class="go primary" disabled={!game.canBet || game.busy || game.autoPlay} onclick={() => game.begin()}>
          {game.ended ? 'New round' : 'Dig'}
        </button>
        <span class="note">
          {stars} {stars === 1 ? 'star' : 'stars'}{carts ? ' and a mine cart' : ''} on this board · or pick any square to start
        </span>
      {/if}
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
      stats={game.stats('Rounds')}
      sessionNet={game.sessionNet}
      history={game.history}
    >
      {#snippet automation()}
        <section class="panel ipanel">
          <div class="row">
            <span class="muted">Auto play digs</span>
            <div class="stepper small" role="group" aria-label="Digs each round in auto play">
              <button type="button" aria-label="Fewer" onclick={() => game.setAutoDigs(game.autoDigs - 1)} disabled={game.autoDigs <= 1}>−</button>
              <b>{game.autoDigs}</b>
              <button type="button" aria-label="More" onclick={() => game.setAutoDigs(game.autoDigs + 1)} disabled={game.autoDigs >= MINES_TILES - game.bombs}>+</button>
            </div>
          </div>
          <p class="note">Auto play digs that many squares at random, then cashes out, round after round. Carts and the vault play themselves.</p>
        </section>
      {/snippet}
      <section class="panel ipanel">
        <h2>The dig <span>at a {formatMoney(game.bet)} bet</span></h2>
        <p class="note">
          {game.bombs} {game.bombs === 1 ? 'stick' : 'sticks'}, {stars} {stars === 1 ? 'star' : 'stars'}{carts ? ', a mine cart' : ''} and {gems}
          gems. Pays back {(game.rtp * 100).toFixed(1)}%, vault included, however you dig.
        </p>
        <table class="ladder">
          <thead><tr><th>Safe digs</th><th>Cash-out, on average</th><th>Chance</th></tr></thead>
          <tbody>
            {#each [1, 2, 3, 5, 8, 12].filter((k) => k <= MINES_TILES - game.bombs) as k (k)}
              <tr>
                <td>{k}</td>
                <td>{formatMoney(game.bet.mul(minesAverage(game.bombs, k, game.rtp)))}</td>
                <td>{(minesSurvival(game.bombs, k) * 100).toFixed(minesSurvival(game.bombs, k) < 0.01 ? 2 : 1)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">Gems alone pay a little less than the average; stars and the cart, more. The chance is of that many safe squares in a row.</p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  .mines-stage {
    --sq: clamp(40px, min(calc((100cqw - 80px) / 5), calc((100cqh - 170px) / 5)), 100px);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px 28px;
    flex-wrap: wrap;
    width: 100%;
  }
  .readout {
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 200px;
  }
  .readout .k {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #f2d9a4;
  }
  .readout b {
    font: 700 clamp(26px, 5cqw, 40px) / 1 var(--font-display);
    color: #fff;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 0 rgb(0 0 0 / 0.6);
  }
  .readout .hint {
    font: 12px/1 var(--font-ui);
    color: rgb(242 217 164 / 0.6);
  }
  .result {
    animation: pop 380ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .result.boom {
    color: #ff7a4c !important;
  }
  .result.cashed {
    color: #8cf08a !important;
  }
  .next {
    display: flex;
    gap: 12px;
    font: 600 13px/1 var(--font-ui);
    color: #e8dcc4;
  }
  .next span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .next .risk {
    color: #ffab8a;
  }
  .mini {
    display: inline-block;
    width: 12px;
    height: 12px;
  }
  .mini.gem {
    background: #5fd0ff;
    clip-path: polygon(20% 0, 80% 0, 100% 35%, 50% 100%, 0 35%);
  }
  .mini.star {
    background: #ffd75e;
    clip-path: polygon(50% 0, 62% 35%, 100% 38%, 70% 60%, 80% 100%, 50% 78%, 20% 100%, 30% 60%, 0 38%, 38% 35%);
  }
  .mini.cart {
    border-radius: 2px 2px 5px 5px;
    background: #c48a3a;
  }
  .mini.boom {
    border-radius: 2px;
    background: #e8453a;
  }

  /* The Gem Vault: a safe that fills as you find things. */
  .vault {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 4px;
    padding: 7px 12px 7px 8px;
    border-radius: 12px;
    background: rgb(0 0 0 / 0.4);
    box-shadow: inset 0 0 0 1px rgb(95 208 255 / 0.3);
  }
  .vault svg {
    grid-row: span 2;
    width: 36px;
    height: 36px;
  }
  .vault.drop svg {
    animation: clunk 380ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes clunk {
    40% {
      scale: 1.15;
      filter: brightness(1.6) drop-shadow(0 0 8px #5fd0ff);
    }
  }
  .vault.full {
    box-shadow:
      inset 0 0 0 2px #5fd0ff,
      0 0 18px rgb(95 208 255 / 0.6);
  }
  .vtext {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font: 12px/1 var(--font-ui);
    color: #bfe9ff;
  }
  .vtext b {
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5fd0ff;
  }
  .vbar {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.1);
    overflow: hidden;
  }
  .vbar i {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, #2f8fcf, #5fd0ff);
    transition: width 0.4s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .vault small {
    grid-column: 2;
    font: 600 10px/1 var(--font-ui);
    color: rgb(191 233 255 / 0.6);
  }

  /* The dig site: 25 squares of packed earth and stone. */
  .field {
    position: relative;
    display: grid;
    grid-template-columns: repeat(5, var(--sq));
    gap: 7px;
    padding: 12px;
    border-radius: 16px;
    background: linear-gradient(#2a1d14, #1a120c);
    box-shadow:
      inset 0 0 0 2px rgb(255 200 120 / 0.12),
      inset 0 6px 18px rgb(0 0 0 / 0.6),
      0 10px 30px rgb(0 0 0 / 0.5);
  }
  .field.boom {
    animation: shake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
  /* The blast lights the whole mine for an instant. */
  .blast::after {
    content: '';
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle, rgb(255 200 120 / 0.7), rgb(255 90 30 / 0.25) 40%, transparent 70%);
    animation: flash 0.7s ease-out forwards;
    pointer-events: none;
  }
  @keyframes flash {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes shake {
    20%,
    60% {
      translate: -7px 2px;
    }
    40%,
    80% {
      translate: 7px -2px;
    }
  }
  .square {
    position: relative;
    width: var(--sq);
    height: var(--sq);
    min-width: 0;
    min-height: 0;
    padding: 12%;
    border: 0;
    border-radius: 12px;
    background:
      radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.16), transparent 40%),
      radial-gradient(circle at 70% 70%, rgb(0 0 0 / 0.25), transparent 50%),
      linear-gradient(145deg, #8a6a4c, #5e4530 55%, #3e2c1e);
    box-shadow:
      inset 0 2px 0 rgb(255 255 255 / 0.18),
      inset 0 -3px 0 rgb(0 0 0 / 0.35),
      0 3px 6px rgb(0 0 0 / 0.45);
    transition:
      transform 120ms ease,
      filter 120ms ease;
  }
  .square:disabled {
    opacity: 1;
    cursor: default;
  }
  .live .square:not(:disabled) {
    cursor: pointer;
  }
  .live .square:not(:disabled):hover {
    transform: translateY(-3px);
    filter: brightness(1.2);
  }
  .live .square:not(:disabled):active {
    transform: translateY(1px) scale(0.97);
  }
  .square.open {
    background: radial-gradient(circle, #2e2218, #160f0a);
    box-shadow: inset 0 3px 8px rgb(0 0 0 / 0.7);
  }
  .square svg {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .square.dug svg {
    animation: unearth 460ms cubic-bezier(0.3, 1.7, 0.5, 1);
  }
  .square.dug.gem svg {
    filter: drop-shadow(0 0 6px rgb(95 208 255 / 0.8));
  }
  .square.dug.gem {
    box-shadow:
      inset 0 0 0 2px rgb(95 208 255 / 0.6),
      0 0 14px rgb(95 208 255 / 0.35);
  }
  .square.dug.star {
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      0 0 22px rgb(255 215 94 / 0.7);
  }
  .square.dug.star svg {
    animation:
      unearth 460ms cubic-bezier(0.3, 1.7, 0.5, 1),
      twinkle 1.2s ease-in-out 0.5s infinite alternate;
  }
  @keyframes twinkle {
    to {
      filter: drop-shadow(0 0 10px #ffd75e) brightness(1.2);
    }
  }
  .square.dug.cart {
    box-shadow:
      inset 0 0 0 2px #c48a3a,
      0 0 16px rgb(196 138 58 / 0.6);
  }
  .square.hit {
    background: radial-gradient(circle, #ff9a3c, #7a1d06 70%);
    box-shadow: 0 0 34px rgb(255 120 40 / 0.95);
    z-index: 1;
  }
  .square.open:not(.dug) {
    opacity: 0.42;
  }
  /* A dig throws up a little dust. */
  .puff {
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(210 180 140 / 0.7), transparent 65%);
    animation: puff 520ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes puff {
    from {
      scale: 0.4;
      opacity: 1;
    }
    to {
      scale: 1.8;
      opacity: 0;
    }
  }
  @keyframes unearth {
    from {
      transform: scale(0.2) rotate(-20deg);
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      scale: 0.6;
      opacity: 0;
    }
  }

  /* The ride and the vault's board open over the dig site. */
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 16px;
    background: rgb(14 10 7 / 0.94);
    box-shadow: inset 0 0 0 2px #c48a3a;
    text-align: center;
    animation: pop 300ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .overlay h3 {
    margin: 0;
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #f2d9a4;
  }
  .overlay h3 b {
    margin-left: 8px;
    color: #ffd75e;
  }
  .overlay p {
    margin: 0;
    font: 13px/1.4 var(--font-ui);
    color: #e8dcc4;
  }
  .junctions {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .junctions li {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    font: 700 12px/1 var(--font-ui);
    color: rgb(232 220 196 / 0.6);
  }
  .junctions li.past {
    background: rgb(196 138 58 / 0.35);
    color: #ffd75e;
  }
  .junctions li.now {
    background: #ffd75e;
    color: #3a2600;
  }
  .tunnels {
    display: flex;
    gap: 12px;
  }
  .tunnel {
    display: grid;
    justify-items: center;
    gap: 4px;
    width: calc(var(--sq) * 1.1);
    padding: 6px;
    border: 0;
    border-radius: 12px;
    background: rgb(255 255 255 / 0.05);
    cursor: pointer;
  }
  .tunnel:hover {
    background: rgb(255 215 94 / 0.14);
    transform: translateY(-2px);
  }
  .tunnel svg {
    width: 100%;
  }
  .tunnel span {
    font: 700 14px/1 var(--font-display);
    color: #ffd75e;
  }
  .verdict {
    font-size: 15px !important;
    color: #8cf08a !important;
    animation: pop 300ms ease;
  }
  .verdict.caved {
    color: #ffab8a !important;
  }
  .vaultboard {
    box-shadow: inset 0 0 0 2px #5fd0ff;
  }
  .vaultboard h3 {
    color: #bfe9ff;
  }
  .vgrid {
    display: grid;
    grid-template-columns: repeat(5, calc(var(--sq) * 0.62));
    gap: 5px;
  }
  .vsq {
    height: calc(var(--sq) * 0.62);
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(145deg, #2f5f8a, #173450);
    color: #bfe9ff;
    font: 700 13px/1 var(--font-display);
    cursor: pointer;
  }
  .vsq:disabled {
    opacity: 1;
    cursor: default;
  }
  .vsq.open {
    background: rgb(255 255 255 / 0.06);
    color: rgb(191 233 255 / 0.45);
  }
  .vsq.mine {
    background: linear-gradient(145deg, #5fd0ff, #2f8fcf);
    color: #08202e;
    animation: pop 300ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .ladder {
    width: 100%;
    border-collapse: collapse;
    font: 13px/1.5 var(--font-ui);
  }
  .ladder th {
    text-align: left;
    color: var(--muted);
    font-weight: 600;
  }
  .ladder td:nth-child(n + 2),
  .ladder th:nth-child(n + 2) {
    text-align: right;
  }
</style>
