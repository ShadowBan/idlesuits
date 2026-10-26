<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    rankLabel,
    TCP_BONUSES,
    THREE_CARD_NAMES,
    threeCardScore,
    type Card,
    type TcpMove,
    type ThreeCardHand,
  } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import DecisionBar from '../../components/DecisionBar.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import { handPhrase, showdownLine } from '../../lib/verdict';
  import { TcpGame } from './game.svelte';
  import TcpRules from './TcpRules.svelte';

  let { onExit }: GameProps = $props();

  const game = new TcpGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<TcpRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  /** "Queen high" reads better than "High card" for the hands that decide most rounds. */
  function handName(hand: ThreeCardHand | null, cards: (Card | null)[]): string {
    if (!hand) return '';
    if (hand !== 'high') return THREE_CARD_NAMES[hand];
    const top = Math.max(...cards.filter((c): c is Card => c !== null).map((c) => c.rank));
    return `${rankLabel(top)} high`;
  }

  const options = $derived(
    game.suggestion === null
      ? []
      : ([
          ['Fold', 'fold', 'F'],
          ['Play 1×', 'play', 'P'],
        ] as const).map(([label, move, key]) => ({
          label,
          key,
          sub: move === 'play' ? formatMoney(game.roundAnte) : undefined,
          suggested: move === game.suggestion,
          pick: () => game.choose(move as TcpMove),
        })),
  );

  // The spots on the felt.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.ante?.net));
  const play = $derived(
    spotView(betting, game.roundAnte, game.played ? 1 : 0, new Decimal(0), game.results.play?.net),
  );
  const sides = $derived(
    TCP_BONUSES.map((bet) => ({
      bet,
      ...spotView(
        betting,
        game.roundAnte,
        game.roundSide[bet.id] ?? 0,
        game.side.amount(bet.id),
        game.bonusResults[bet.id]?.net,
      ),
    })),
  );
  /** The Ante bonus is paid beside the Ante. */
  const anteNet = $derived(
    ante.net && game.results.anteBonus ? ante.net.add(game.roundAnte.mul(game.results.anteBonus.net)) : ante.net,
  );

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }
  function placeSide(id: string) {
    if (game.bets.addSide(id, heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting) return null;
    const net = game.roundAnte.mul(game.net);
    const you = { name: handName(game.playerHand, game.player), score: threeCardScore(game.player as Card[]) };
    const them = { name: handName(game.dealerHand, game.dealer), score: threeCardScore(game.dealer as Card[]) };
    if (game.folded) return { title: 'Folded', net, detail: `You folded ${handPhrase(you.name)}`, big: false };
    if (!game.qualified) {
      return { title: 'You win', net, detail: `Dealer has only ${handPhrase(them.name)} · ante pays`, big: game.net >= 5 };
    }
    const title = you.score > them.score ? 'You win' : you.score < them.score ? 'Dealer wins' : 'Push';
    return { title, net, detail: showdownLine(you, them), big: game.net >= 5 };
  });

  const ANTE_ROWS = $derived(
    (['straightFlush', 'trips', 'straight'] as const).map((h) => ({
      label: THREE_CARD_NAMES[h],
      pays: `${game.rules.anteBonus[h]}:1`,
    })),
  );
  const anteLit = $derived(
    game.played && game.playerHand && game.net !== null
      ? THREE_CARD_NAMES[game.playerHand === 'miniRoyal' ? 'straightFlush' : game.playerHand]
      : undefined,
  );

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const option = options.find((o) => o.key === e.key.toUpperCase());
    if (option && seq.awaiting === 'move') return option.pick();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<TcpRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Three Card', 'Poker']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 3, rows: 2, reserve: 230 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="area dealer">
        <CardRow
          title="Dealer"
          cards={game.dealer}
          side="dealer"
          {flipMs}
          deal={game.deals}
          dealOrder={1}
          focus={game.dealerFocus}
        >
          {#snippet badge()}
            {#if game.dealerHand}<span class="hand-name">{handName(game.dealerHand, game.dealer)}</span>{/if}
          {/snippet}
          {#snippet tag()}
            {#if game.dealerHand}<span class="hand-tag" class:good={!game.qualified}>{game.qualified ? 'Qualifies' : 'No qualify'}</span>{/if}
          {/snippet}
        </CardRow>
      </div>

      <FeltBand title="Three Card Poker" lines={['Dealer plays with queen high', 'Ante bonus on a straight or better']} {result} />

      <div class="spots">
        <div class="row-spots">
          <BetSpot
            label="Pairplus"
            shape="diamond"
            amount={sides[0]!.amount}
            net={sides[0]!.net}
            next={sides[0]!.next}
            onPlace={() => placeSide('pairPlus')}
            onClear={() => game.bets.clearSide('pairPlus')}
          />
          <BetSpot
            label="Ante"
            size="lg"
            amount={ante.amount}
            net={anteNet}
            next={ante.next}
            onPlace={placeAnte}
            onClear={() => game.bets.clearMain()}
          />
          <BetSpot label="Play" size="lg" hint="= Ante" amount={play.amount} net={play.net} active={seq.awaiting === 'move'} />
        </div>
        <div class="row-spots small">
          {#each sides.slice(1) as side (side.bet.id)}
            <BetSpot
              label={side.bet.short}
              size="sm"
              amount={side.amount}
              net={side.net}
              next={side.next}
              onPlace={() => placeSide(side.bet.id)}
              onClear={() => game.bets.clearSide(side.bet.id)}
            />
          {/each}
        </div>
      </div>

      <div class="area player">
        <CardRow title="You" cards={game.player} side="player" {flipMs} deal={game.deals} dealOrder={0}>
          {#snippet badge()}
            {#if game.playerHand}<span class="hand-name">{handName(game.playerHand, game.player)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Three cards each. Play if you think yours beat the dealer's — the dealer needs a queen high to qualify."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && game.suggestion}
      <DecisionBar {options} hint="Play queen-6-4 or better · folding loses the ante" />
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
      lastUnit={game.lastAnte}
      stats={[
        ['Hands', String(game.hands)],
        ['Folds', String(game.folds)],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: h.player, sub: `v ${h.dealer}`, net: h.net }))}
    >
      <section class="panel">
        <PayTable title="Ante bonus (when you play, win or lose)" rows={ANTE_ROWS} lit={anteLit} />
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
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  .row-spots {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(18px, 5cqw, 34px);
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
  }
  /* Landscape phones: dealer and player side by side, bets in a column. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(30px, min(calc((100cqw - 250px) / 7.4), calc((100cqh - 70px) / 1.5)), 96px);
      position: relative;
      grid-template-columns: 1fr 1fr auto;
      grid-template-rows: 1fr;
      grid-template-areas: 'dealer player spots';
      column-gap: 10px;
    }
    .row-spots:not(.small) {
      flex-wrap: wrap;
      width: 190px;
    }
  }
</style>
