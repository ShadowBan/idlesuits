<script lang="ts">
  import { onDestroy } from 'svelte';
  import { FOUR_CARD_NAMES, fourCategoryOf, FourCategory, fourTopRank, type C4pChoice, type Card } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import DecisionBar from '../../components/DecisionBar.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import { handPhrase, showdownLine } from '../../lib/verdict';
  import C4pRules from './C4pRules.svelte';
  import { C4pGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new C4pGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<C4pRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  const same = (a: C4pChoice, b: C4pChoice | null) =>
    !!b && a.move === b.move && (a.move === 'fold' || (b.move === 'play' && a.size === b.size));

  /** Fold, play 1×, and 3× only with a pair of aces or better. */
  const options = $derived(
    game.suggestion === null
      ? []
      : [
          { label: 'Fold', choice: { move: 'fold' } as C4pChoice, key: 'F' },
          ...game.sizes.map((size) => ({
            label: `Play ${size}×`,
            choice: { move: 'play', size } as C4pChoice,
            key: String(size),
          })),
        ].map((o) => ({
          label: o.label,
          key: o.key,
          sub: o.choice.move === 'play' ? formatMoney(game.roundAnte.mul(o.choice.size)) : undefined,
          suggested: same(o.choice, game.suggestion),
          pick: () => game.choose(o.choice),
        })),
  );

  const RANK_WORDS: Record<number, [string, string]> = {
    11: ['Jack', 'jacks'],
    12: ['Queen', 'queens'],
    13: ['King', 'kings'],
    14: ['Ace', 'aces'],
  };
  /** A best-four hand by name: "Pair of aces", "King high", "Flush". */
  function fourName(score: number | null): string {
    if (score === null) return '';
    const category = fourCategoryOf(score);
    const top = fourTopRank(score);
    if (category === FourCategory.Pair) return `Pair of ${RANK_WORDS[top]?.[1] ?? `${top}s`}`;
    if (category === FourCategory.HighCard) return `${RANK_WORDS[top]?.[0] ?? top} high`;
    if (category === FourCategory.Quads && top === 14) return 'Four aces';
    return FOUR_CARD_NAMES[category];
  }

  /** The four cards that play, lifted; the fifth is dimmed. */
  const keep = (cards: (Card | null)[], discard: number) =>
    discard < 0 ? undefined : new Set(cards.filter((c, i): c is Card => c !== null && i !== discard).map((c) => c.uid));

  // The spots on the felt.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.ante?.net));
  const superBonus = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.superBonus?.net));
  const play = $derived(spotView(betting, game.roundAnte, game.play, new Decimal(0), game.results.play?.net));
  const side = $derived(
    spotView(
      betting,
      game.roundAnte,
      game.roundSide.queensUp ?? 0,
      game.side.amount('queensUp'),
      game.bonusResults.queensUp?.net,
    ),
  );

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || game.playerScore === null || game.dealerScore === null) return null;
    const net = game.roundAnte.mul(game.net);
    const you = { name: fourName(game.playerScore), score: game.playerScore };
    const them = { name: fourName(game.dealerScore), score: game.dealerScore };
    if (game.folded) return { title: 'Folded', net, detail: `You folded ${handPhrase(you.name)}`, big: false };
    if (!game.opens) {
      return { title: 'You win', net, detail: `Dealer does not open with ${handPhrase(them.name)}`, big: game.net >= 10 };
    }
    const title = you.score > them.score ? 'You win' : you.score < them.score ? 'Dealer wins' : 'Push';
    return { title, net, detail: showdownLine(you, them), big: game.net >= 10 };
  });

  const SUPER_ROWS = $derived([
    { label: 'Four aces', pays: `${game.rules.superBonus.fourAces}:1` },
    { label: 'Four of a kind', pays: `${game.rules.superBonus.quads}:1` },
    { label: 'Straight flush', pays: `${game.rules.superBonus.straightFlush}:1` },
    { label: 'Three of a kind', pays: `${game.rules.superBonus.trips}:1` },
    { label: 'Flush', pays: '3:2' },
    { label: 'Straight', pays: `${game.rules.superBonus.straight}:1` },
  ]);
  const superLit = $derived(
    game.results.superBonus && game.results.superBonus.net > 0 && game.playerScore !== null
      ? fourName(game.playerScore)
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
<C4pRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Crazy 4', 'Poker']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 5, rows: 2, reserve: 236 }}
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
          highlight={keep(game.dealer, game.dealerDiscard)}
        >
          {#snippet badge()}
            {#if game.dealerScore !== null}
              <span class="hand-name">{fourName(game.dealerScore)}</span>
              <span class="hand-tag" class:good={!game.opens}>{game.opens ? 'Opens' : 'No open'}</span>
            {/if}
          {/snippet}
        </CardRow>
      </div>

      <FeltBand title="Crazy 4 Poker" lines={['Best four of five', 'Dealer opens with king high']} {result} />

      <div class="spots">
        <BetSpot
          label="Queens Up"
          shape="diamond"
          amount={side.amount}
          net={side.net}
          next={side.next}
          onPlace={() => game.bets.addSide('queensUp', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('queensUp')}
        />
        <BetSpot
          label="Ante"
          size="lg"
          amount={ante.amount}
          net={ante.net}
          next={ante.next}
          onPlace={placeAnte}
          onClear={() => game.bets.clearMain()}
        />
        <BetSpot
          label="Super"
          size="lg"
          hint="= Ante"
          amount={superBonus.amount}
          net={superBonus.net}
          next={superBonus.next}
        />
        <BetSpot
          label="Play"
          size="lg"
          hint="1× or 3×"
          amount={play.amount}
          net={play.net}
          active={seq.awaiting === 'move'}
        />
      </div>

      <div class="area player">
        <CardRow
          title="You"
          cards={game.player}
          side="player"
          {flipMs}
          deal={game.deals}
          dealOrder={0}
          highlight={keep(game.player, game.playerDiscard)}
        >
          {#snippet badge()}
            {#if game.playerScore !== null}<span class="hand-name">{fourName(game.playerScore)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Five cards each; your best four play. Play 3× with aces or better, and the Super Bonus pays any straight or better."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && game.suggestion}
      <DecisionBar {options} hint="Play K-Q-8-4 or better; 3× with aces or better" />
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
        <PayTable title="Super Bonus (straight or better, win or lose)" rows={SUPER_ROWS} lit={superLit} />
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
    gap: clamp(12px, 3.6cqw, 28px);
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
  /* Landscape phones: the hands stacked on the left, the bets in a column on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(30px, min(calc((100cqw - 200px) / 5.9), calc((100cqh - 84px) / 2.8)), 96px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'player spots';
      column-gap: 12px;
    }
    .spots {
      flex-wrap: wrap;
      width: 170px;
      align-content: center;
      row-gap: 4px;
    }
  }
</style>
