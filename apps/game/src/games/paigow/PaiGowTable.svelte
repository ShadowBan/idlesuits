<script lang="ts">
  import { onDestroy } from 'svelte';
  import { PG_BONUSES, pgHandName, pgLowName as lowName, type HandWinner } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import DecisionBar from '../../components/DecisionBar.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import { PaiGowGame } from './game.svelte';
  import PaiGowRules from './PaiGowRules.svelte';
  import SplitHand from './SplitHand.svelte';

  let { onExit }: GameProps = $props();

  const game = new PaiGowGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<PaiGowRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 260, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const setting = $derived(seq.awaiting === 'move');
  const preview = $derived(game.preview);

  const resultFor = (w: HandWinner | undefined, mine: boolean) =>
    w === undefined ? undefined : (w === 'player') === mine ? 'won' : 'lost';

  const options = $derived([
    { label: 'House way', key: 'H', pick: () => game.showHouseWay() },
    { label: 'Set hand', key: 'Space', suggested: game.canSet, disabled: !game.canSet, pick: () => game.confirm() },
  ]);
  const hint = $derived(
    !preview
      ? `Tap two cards for your low hand${game.picked.length === 1 ? ' — one more' : ''}`
      : !preview.legal
        ? 'Foul: the high hand must beat the low hand'
        : `High: ${pgHandName(preview.hands.highScore)} · Low: ${lowName(preview.hands.lowScore)}`,
  );

  // The spots on the felt.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const mainNet = $derived(game.outcome === null ? undefined : game.outcome === 'win' ? 0.95 : game.outcome === 'push' ? 0 : -1);
  const bet = $derived(spotView(betting, game.roundBet, 1, game.bet, mainNet));
  const sides = $derived(
    PG_BONUSES.map((b) => ({
      bet: b,
      ...spotView(betting, game.roundBet, game.roundSide[b.id] ?? 0, game.side.amount(b.id), game.bonusResults[b.id]?.net),
    })),
  );

  function placeBet() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || !game.playerSet || !game.dealerSet) return null;
    const net = game.roundBet.mul(game.net);
    const high = game.winners.high === 'player' ? 'Your high' : "The dealer's high";
    const low = game.winners.low === 'player' ? 'your low' : "the dealer's low";
    if (game.outcome === 'win') return { title: 'You win both', net, detail: 'Paid 1:1 less 5% commission', big: game.net >= 5 };
    if (game.outcome === 'push') return { title: 'Push', net, detail: `${high} wins, ${low} wins`, big: false };
    const copies = game.winners.high === 'copy' || game.winners.low === 'copy';
    return { title: 'Dealer wins', net, detail: copies ? 'Ties go to the dealer' : 'The dealer took both hands', big: false };
  });

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    if (setting && e.key.toLowerCase() === 'h') return game.showHouseWay();
    if (setting && /^[1-7]$/.test(e.key)) return game.toggle(Number(e.key) - 1);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<PaiGowRules bind:this={rules} />

<TableShell
  title={['Pai Gow', 'Poker']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 7.6, rows: 2, reserve: 250 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="area dealer">
        <SplitHand
          title="Dealer"
          side="dealer"
          cards={game.dealer}
          set={game.dealerSet?.set ?? null}
          lowName={game.dealerSet ? lowName(game.dealerSet.hands.lowScore) : undefined}
          highName={game.dealerSet ? pgHandName(game.dealerSet.hands.highScore) : undefined}
          lowResult={resultFor(game.winners.low, false)}
          highResult={resultFor(game.winners.high, false)}
          {flipMs}
          deal={game.deals}
          dealOrder={1}
          focus={game.dealerFocus}
        />
      </div>

      <FeltBand title="Pai Gow Poker" lines={['Win both hands to get paid', 'Ties go to the dealer']} {result} />

      <div class="spots">
        <BetSpot
          label="Bet"
          size="lg"
          amount={bet.amount}
          net={bet.net}
          next={bet.next}
          onPlace={placeBet}
          onClear={() => game.bets.clearMain()}
        />
        {#each sides as side (side.bet.id)}
          <BetSpot
            label={side.bet.short}
            size="sm"
            amount={side.amount}
            net={side.net}
            next={side.next}
            onPlace={() => game.bets.addSide(side.bet.id, heldValue(game.bank)) && sfx.chip()}
            onClear={() => game.bets.clearSide(side.bet.id)}
          />
        {/each}
      </div>

      <div class="area player">
        <SplitHand
          title="You"
          side="player"
          cards={game.player}
          set={game.playerSet?.set ?? null}
          lowName={game.playerSet ? lowName(game.playerSet.hands.lowScore) : preview ? lowName(preview.hands.lowScore) : undefined}
          highName={game.playerSet
            ? pgHandName(game.playerSet.hands.highScore)
            : preview
              ? pgHandName(preview.hands.highScore)
              : undefined}
          lowResult={resultFor(game.winners.low, true)}
          highResult={resultFor(game.winners.high, true)}
          picked={game.picked}
          onPick={setting ? (i) => game.toggle(i) : undefined}
          {flipMs}
          deal={game.deals}
          dealOrder={0}
        />
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Seven cards: set the best five as your high hand and two as your low. Win both to get paid; win one and it pushes."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if setting}
      <DecisionBar {options} {hint} />
    {:else}
      <BetBar
        bank={game.bank}
        total={game.bets.total}
        canDeal={seq.awaiting === 'deal' && game.bets.canDeal}
        onDeal={() => game.deal()}
        onClear={() => game.bets.clearAll()}
        onDouble={() => game.bets.double()}
        trailing={game.autoPlay && game.started ? pause : undefined}
      />
    {/if}
  {/snippet}

  {#snippet panels()}
    <TablePanels
      {seq}
      {muted}
      onMute={(m) => (muted = m)}
      seed={game.runSeed}
      round={game.round}
      onRestart={() => game.restart()}
      last={game.last}
      lastUnit={game.lastBet}
      stats={[
        ['Hands', String(game.hands)],
        ['Won · pushed · lost', `${game.outcomes.win} · ${game.outcomes.push} · ${game.outcomes.lose}`],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: h.high, sub: h.low, net: h.net }))}
    >
      <section class="panel">
        <h2>How it pays</h2>
        <p class="note">
          Win both hands: paid 1:1 less 5% commission. Win one: push. Ties go to the dealer. The dealer sets by the
          house way.
        </p>
      </section>
      <SideBetsPanel stakes={game.side} results={game.bonusResults} />
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
    grid-template-rows: auto minmax(36px, 1fr) auto auto;
    grid-template-areas: 'dealer' 'band' 'spots' 'player';
    align-items: center;
    justify-items: center;
    gap: 6px;
  }
  .area {
    width: 100%;
  }
  .dealer {
    grid-area: dealer;
  }
  .player {
    grid-area: player;
  }
  .spots {
    grid-area: spots;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(12px, 4cqw, 30px);
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
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  /* Landscape phones: the two hands stacked on the left, the bets in a column on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(28px, min(calc((100cqw - 130px) / 8.6), calc((100cqh - 140px) / 2.8)), 90px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'player spots';
      column-gap: 10px;
    }
    .spots {
      flex-wrap: wrap;
      width: 124px;
      align-content: center;
      gap: 4px 8px;
    }
  }
</style>
