<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Category, CATEGORY_NAMES, handName, type CspMove } from '@idlesuits/sim';
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
  import CspRules from './CspRules.svelte';
  import { CspGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new CspGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<CspRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  const options = $derived(
    game.suggestion === null
      ? []
      : ([
          ['Fold', 'fold', 'F'],
          ['Raise 2×', 'raise', 'R'],
        ] as const).map(([label, move, key]) => ({
          label,
          key,
          sub: move === 'raise' ? formatMoney(game.roundAnte.mul(game.rules.raise)) : undefined,
          suggested: move === game.suggestion,
          pick: () => game.choose(move as CspMove),
        })),
  );

  // The spots on the felt.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.ante?.net));
  const raise = $derived(
    spotView(betting, game.roundAnte, game.raised ? game.rules.raise : 0, new Decimal(0), game.results.raise?.net),
  );
  const side = $derived(
    spotView(
      betting,
      game.roundAnte,
      game.roundSide.fivePlusOne ?? 0,
      game.side.amount('fivePlusOne'),
      game.bonusResults.fivePlusOne?.net,
    ),
  );

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || !game.playerHand || !game.dealerHand) return null;
    const net = game.roundAnte.mul(game.net);
    const you = { name: handName(game.playerHand), score: game.playerHand.score };
    const them = { name: handName(game.dealerHand), score: game.dealerHand.score };
    if (game.folded) return { title: 'Folded', net, detail: `You folded ${handPhrase(you.name)}`, big: false };
    if (!game.qualified) {
      return { title: 'You win', net, detail: `Dealer has ${handPhrase(them.name)}: no ace-king, ante pays`, big: false };
    }
    const title = you.score > them.score ? 'You win' : you.score < them.score ? 'Dealer wins' : 'Push';
    return { title, net, detail: showdownLine(you, them), big: game.net >= 8 };
  });

  const RAISE_ROWS = $derived(
    [
      Category.RoyalFlush,
      Category.StraightFlush,
      Category.Quads,
      Category.FullHouse,
      Category.Flush,
      Category.Straight,
      Category.Trips,
      Category.TwoPair,
    ]
      .map((c) => ({ label: CATEGORY_NAMES[c], pays: `${game.rules.raisePays[c]}:1` }))
      .concat({ label: 'Pair or less', pays: '1:1' }),
  );
  const raiseLit = $derived.by(() => {
    if (!game.results.raise || game.results.raise.net <= 0 || !game.playerHand) return undefined;
    return game.playerHand.category <= Category.Pair ? 'Pair or less' : CATEGORY_NAMES[game.playerHand.category];
  });

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
<CspRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Caribbean', 'Stud']}
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
        >
          {#snippet badge()}
            {#if game.dealerHand}<span class="hand-name">{handName(game.dealerHand)}</span>{/if}
          {/snippet}
          {#snippet tag()}
            {#if game.dealerHand}<span class="hand-tag" class:good={!game.qualified}>{game.qualified ? 'Qualifies' : 'No qualify'}</span>{/if}
          {/snippet}
        </CardRow>
      </div>

      <FeltBand title="Caribbean Stud" lines={['Dealer qualifies with ace-king', 'Raise pays up to 100 to 1']} {result} />

      <div class="spots">
        <BetSpot
          label="5+1"
          shape="diamond"
          amount={side.amount}
          net={side.net}
          next={side.next}
          onPlace={() => game.bets.addSide('fivePlusOne', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('fivePlusOne')}
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
          label="Raise"
          size="lg"
          hint="2× Ante"
          amount={raise.amount}
          net={raise.net}
          active={seq.awaiting === 'move'}
        />
      </div>

      <div class="area player">
        <CardRow title="You" cards={game.player} side="player" {flipMs} deal={game.deals} dealOrder={0}>
          {#snippet badge()}
            {#if game.playerHand}<span class="hand-name">{handName(game.playerHand)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Five cards each, one of the dealer's face up. Raise if you can beat the dealer — a big hand pays up to 100:1."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && game.suggestion}
      <DecisionBar {options} hint="Raise any pair; ace-king depends on the dealer's card" />
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
        <PayTable title="Raise pays (when you beat a qualifying dealer)" rows={RAISE_ROWS} lit={raiseLit} />
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
    gap: clamp(18px, 5cqw, 34px);
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
      --card-w: clamp(30px, min(calc((100cqw - 150px) / 5.9), calc((100cqh - 84px) / 2.8)), 96px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'player spots';
      column-gap: 12px;
    }
    .spots {
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
  }
</style>
