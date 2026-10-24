<script lang="ts">
  import { onDestroy } from 'svelte';
  import { CATEGORY_NAMES, handName, type StudChoice } from '@idlesuits/sim';
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
  import { StudGame } from './game.svelte';
  import StudRules from './StudRules.svelte';

  let { onExit }: GameProps = $props();

  const game = new StudGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<StudRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const pending = $derived(game.pending);

  const CHOICES: { label: string; choice: StudChoice; key: string }[] = [
    { label: 'Fold', choice: { move: 'fold' }, key: 'F' },
    { label: 'Bet 1×', choice: { move: 'bet', size: 1 }, key: '1' },
    { label: 'Bet 3×', choice: { move: 'bet', size: 3 }, key: '3' },
  ];
  const same = (a: StudChoice, b: StudChoice) =>
    a.move === b.move && (a.move === 'fold' || (b.move === 'bet' && a.size === b.size));
  const options = $derived(
    pending
      ? CHOICES.map((o) => ({
          label: o.label,
          key: o.key,
          sub: o.choice.move === 'bet' ? formatMoney(game.roundAnte.mul(o.choice.size)) : undefined,
          suggested: same(o.choice, pending.suggestion),
          pick: () => game.choose(o.choice),
        }))
      : [],
  );

  const PAY_ROWS = [
    { label: 'Royal flush', pays: '500:1' },
    { label: 'Straight flush', pays: '100:1' },
    { label: 'Four of a kind', pays: '40:1' },
    { label: 'Full house', pays: '10:1' },
    { label: 'Flush', pays: '6:1' },
    { label: 'Straight', pays: '4:1' },
    { label: 'Three of a kind', pays: '3:1' },
    { label: 'Two pair', pays: '2:1' },
    { label: 'Jacks or better', pays: '1:1' },
    { label: 'Sixes to tens', pays: 'push' },
  ];

  /** Which pay table row the final hand landed on. */
  const lit = $derived.by(() => {
    if (!game.hand || game.multiplier === null) return undefined;
    if (game.hand.category === 1) {
      const pair = game.hand.madeRank ?? 0;
      return pair >= 11 ? 'Jacks or better' : pair >= 6 ? 'Sixes to tens' : undefined;
    }
    return game.multiplier >= 0 ? CATEGORY_NAMES[game.hand.category] : undefined;
  });

  // The spots on the felt. Every bet settles at the hand's one multiplier, or is lost on a fold.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const settledAt = $derived(game.folded ? -1 : (game.multiplier ?? undefined));
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, settledAt));
  const streets = $derived(
    game.streetBets.map((units) =>
      spotView(betting, game.roundAnte, units ?? 0, new Decimal(0), units && settledAt !== undefined ? units * settledAt : undefined),
    ),
  );
  const bonus = $derived(
    spotView(
      betting,
      game.roundAnte,
      game.roundSide.threeCard ?? 0,
      game.side.amount('threeCard'),
      game.bonusResults.threeCard?.net,
    ),
  );
  /** The street being bet on now. */
  const streetNow = $derived(pending ? pending.decision.street - 3 : -1);

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting) return null;
    const net = game.roundAnte.mul(game.net);
    if (game.folded) return { title: 'Folded', net, detail: `${formatMoney(game.roundAnte.mul(game.wagered))} given up`, big: false };
    const name = game.hand ? handName(game.hand) : '';
    const m = game.multiplier ?? 0;
    const title = m > 0 ? `Pays ${m}:1` : m === 0 ? 'Push' : 'No pay';
    const detail = m > 0 ? `${name} on ${game.wagered} units` : m === 0 ? `${name}: every bet comes back` : name;
    return { title, net, detail, big: game.net >= 10 };
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
<StudRules bind:this={rules} />

<TableShell
  title={['Mississippi', 'Stud']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 3, rows: 2, reserve: 236 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="area community">
        <CardRow
          title="Community"
          cards={game.community}
          side="board"
          {flipMs}
          deal={game.deals}
          dealOrder={1}
          highlight={game.net !== null ? game.best : undefined}
        />
      </div>

      <FeltBand title="Mississippi Stud" lines={['Pair of jacks or better pays', 'Sixes to tens push']} {result} />

      <div class="spots">
        <BetSpot
          label="3-Card"
          shape="diamond"
          size="sm"
          amount={bonus.amount}
          net={bonus.net}
          next={bonus.next}
          onPlace={() => game.bets.addSide('threeCard', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('threeCard')}
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
        {#each streets as street, i (i)}
          <BetSpot
            label={['3rd', '4th', '5th'][i]!}
            size="md"
            hint="1× or 3×"
            amount={street.amount}
            net={street.net}
            active={streetNow === i}
          />
        {/each}
      </div>

      <div class="area player">
        <CardRow
          title="You"
          cards={game.hole}
          side="player"
          {flipMs}
          deal={game.deals}
          dealOrder={0}
          highlight={game.net !== null ? game.best : undefined}
        >
          {#snippet badge()}
            {#if game.hand}<span class="hand-name">{handName(game.hand)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="No dealer to beat — just a pay table. Raise as your hand improves, and every bet is paid at the same odds."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && pending}
      <DecisionBar
        {options}
        hint={`${pending.decision.street === 5 ? 'Last bet before the final card' : 'Bet to see the next card'} · folding loses ${formatMoney(game.roundAnte.mul(game.wagered))}`}
      />
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
      history={game.history.map((h) => ({ round: h.round, text: h.hand, net: h.net }))}
    >
      <section class="panel">
        <PayTable title="Pays on every bet" rows={PAY_ROWS} {lit} />
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
    grid-template-areas: 'community' 'band' 'spots' 'player';
    align-items: center;
    justify-items: center;
    gap: 6px;
  }
  .area {
    width: 100%;
  }
  .community {
    grid-area: community;
  }
  .player {
    grid-area: player;
  }
  .spots {
    grid-area: spots;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(8px, 2.6cqw, 22px);
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
  /* Landscape phones: community over your cards on the left, the bets in a column on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(30px, min(calc((100cqw - 200px) / 3.6), calc((100cqh - 84px) / 2.8)), 96px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'community spots'
        'player spots';
      column-gap: 12px;
    }
    .spots {
      flex-wrap: wrap;
      width: 190px;
      align-content: center;
      row-gap: 4px;
    }
  }
</style>
