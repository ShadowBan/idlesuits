<script lang="ts">
  import { onDestroy } from 'svelte';
  import { BACCARAT_BONUSES, baccaratTotal, type BaccaratSide, type Card } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import ShoeRack from '../../components/ShoeRack.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import BaccaratHand from './BaccaratHand.svelte';
  import BaccaratRules from './BaccaratRules.svelte';
  import { BaccaratGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new BaccaratGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let rules = $state<BaccaratRules>();

  const FLIP_MS = { smart: 300, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  const NAMES = { player: 'Player', banker: 'Banker', tie: 'Tie' } as const;

  // The spots on the felt. The main bet sits on whichever hand it backs.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const backed = $derived(betting ? game.side : game.roundSideBet);
  const main = $derived(spotView(betting, game.roundBet, 1, game.bet, game.mainNet ?? undefined));
  const empty = { amount: new Decimal(0), net: null, next: null };
  const sides = $derived(
    Object.fromEntries(
      BACCARAT_BONUSES.map((bet) => [
        bet.id,
        {
          bet,
          ...spotView(betting, game.roundBet, game.roundSide[bet.id] ?? 0, game.sides.amount(bet.id), game.bonusResults[bet.id]?.net),
        },
      ]),
    ),
  );

  /** A tap on the backed hand adds a chip; a tap on the other moves the bet there. */
  function placeMain(side: BaccaratSide) {
    if (side !== game.side) {
      game.setSide(side);
      sfx.chip();
      return;
    }
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || !game.winner) return null;
    const net = game.roundBet.mul(game.net);
    const totals = `${NAMES.player} ${totalOf(game.player)} · ${NAMES.banker} ${totalOf(game.banker)}`;
    const title = game.winner === 'tie' ? 'Tie' : `${NAMES[game.winner]} wins`;
    return { title, net, detail: game.natural ? `Natural · ${totals}` : totals, big: game.net >= 5 };
  });

  const totalOf = (cards: (Card | null | undefined)[]) => baccaratTotal(cards.filter((c): c is Card => !!c));

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside')) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.deal();
  }
</script>

<svelte:window onkeydown={onKey} />
<BaccaratRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Punto Banco', 'Baccarat']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 8, rows: 1, reserve: 260 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="hands">
        <BaccaratHand
          title="Player"
          cards={game.player}
          {flipMs}
          focus={game.focus?.hand === 'player' ? game.focus.index : -1}
          won={game.winner === 'player'}
          backed={backed === 'player'}
        />
        <BaccaratHand
          title="Banker"
          cards={game.banker}
          {flipMs}
          focus={game.focus?.hand === 'banker' ? game.focus.index : -1}
          won={game.winner === 'banker'}
          backed={backed === 'banker'}
        />
      </div>

      <FeltBand
        title="Baccarat"
        lines={[`Banker pays ${+(100 * (1 - game.rules.commission)).toFixed(2)} to 100`, 'Tie pays 8 to 1 · Pairs pay 11 to 1']}
        {result}
      />

      <div class="spots">
        <div class="row-spots small">
          {#each ['playerPair', 'tie', 'bankerPair'] as id (id)}
            {@const s = sides[id]!}
            <BetSpot
              label={s.bet.short}
              size={id === 'tie' ? 'md' : 'sm'}
              shape={id === 'tie' ? 'diamond' : 'circle'}
              amount={s.amount}
              net={s.net}
              next={s.next}
              onPlace={() => game.bets.addSide(id, heldValue(game.bank)) && sfx.chip()}
              onClear={() => game.bets.clearSide(id)}
            />
          {/each}
        </div>
        <div class="row-spots">
          {#each ['player', 'banker'] as const as side (side)}
            {@const spot = backed === side ? main : empty}
            <BetSpot
              label={NAMES[side]}
              size="lg"
              hint={side === 'banker' ? 'pays 0.95' : 'pays 1:1'}
              amount={spot.amount}
              net={spot.net}
              next={spot.next}
              onPlace={() => placeMain(side)}
              onClear={() => game.bets.clearMain()}
            />
          {/each}
        </div>
      </div>
    </div>

    <ShoeRack size={game.shoeView.size} next={game.shoeView.next} cut={game.shoeView.cut} shuffling={game.shuffling} />

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Back the Player or the Banker. Closest to nine wins, and the cards decide everything."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    <BetBar
      bank={game.bank}
      total={game.bets.total}
      canDeal={seq.awaiting === 'deal' && game.bets.canDeal}
      hint={game.bets.hint}
      onDeal={() => game.deal()}
      onClear={() => game.bets.clearAll()}
      onDouble={() => game.bets.double()}
      trailing={game.autoPlay && game.started ? pause : undefined}
    />
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
        ['Coups', String(game.hands)],
        ['Player · Banker · Tie', `${game.wins.player} · ${game.wins.banker} · ${game.wins.tie}`],
        ['Naturals', String(game.naturals)],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({
        round: h.round,
        text: NAMES[h.winner],
        sub: `${h.player} v ${h.banker}`,
        net: h.net,
      }))}
    >
      {#snippet record()}
        <section class="panel">
          <h2>Scoreboard <span>this shoe</span></h2>
          <!-- The bead plate: each coup in a column of six, top to bottom, left to right. -->
          <div class="beads" aria-label="This shoe's coups">
            {#each game.road as bead, i (i)}
              <span class="bead {bead.winner}" class:natural={bead.natural}>{bead.winner === 'tie' ? 'T' : bead.winner === 'player' ? 'P' : 'B'}</span>
            {/each}
          </div>
          <p class="note">
            {game.road.filter((b) => b.winner === 'player').length} Player · {game.road.filter((b) => b.winner === 'banker').length} Banker ·
            {game.road.filter((b) => b.winner === 'tie').length} Tie. A ring marks a natural. Past coups don't change the next one.
          </p>
        </section>
      {/snippet}
      <section class="panel">
        <h2>Your bet <span>set with chips on the felt</span></h2>
        <p class="note">
          {formatMoney(game.bet)} on the {game.side === 'banker' ? 'Banker' : 'Player'}. Tap the other hand's spot to move it.
          Banker pays {+(100 * (1 - game.rules.commission)).toFixed(2)}¢ on the dollar but wins more often: its house edge
          is 1.06%, the Player's 1.24%.
        </p>
      </section>
      <SideBetsPanel stakes={game.sides} results={game.bonusResults} />
    </TablePanels>
  {/snippet}
</TableShell>

{#snippet pause()}
  <button type="button" class="pause" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
{/snippet}

<style>
  .layout {
    display: grid;
    height: 100%;
    grid-template-rows: auto minmax(36px, 1fr) auto;
    grid-template-areas: 'hands' 'band' 'spots';
    align-items: center;
    justify-items: center;
    gap: 6px;
  }
  .hands {
    grid-area: hands;
    display: flex;
    justify-content: center;
    gap: clamp(8px, 4cqw, 40px);
    padding-top: 14px;
  }
  .spots {
    grid-area: spots;
    display: grid;
    justify-items: center;
    gap: 4px;
  }
  .row-spots {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(24px, 8cqw, 64px);
  }
  .row-spots.small {
    gap: clamp(14px, 6cqw, 40px);
  }
  .pause {
    min-width: 108px;
    min-height: 44px;
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
  .beads {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(6, 18px);
    grid-auto-columns: 18px;
    gap: 2px;
    min-height: calc(6 * 18px + 5 * 2px);
    padding: 4px;
    border-radius: 6px;
    background: #f2efe8;
    overflow-x: auto;
  }
  .bead {
    display: grid;
    place-items: center;
    border-radius: 50%;
    font: 700 9px/1 var(--font-ui);
    color: #fff;
  }
  .bead.player {
    background: #2f6fd1;
  }
  .bead.banker {
    background: #c42332;
  }
  .bead.tie {
    background: #1e8a4f;
  }
  .bead.natural {
    box-shadow:
      0 0 0 2px #f2efe8,
      0 0 0 3px #e8b64c;
  }
  /* Landscape phones: the hands across the top, the bets in a column. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      /* The result floats over the felt here, placed against this. */
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr;
      grid-template-areas: 'hands spots';
      column-gap: 10px;
    }
  }
</style>
