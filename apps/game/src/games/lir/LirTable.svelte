<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Category, CATEGORY_NAMES, handName, LIR_BONUSES, type LirMove } from '@idlesuits/sim';
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
  import { formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import { LirGame } from './game.svelte';
  import LirRules from './LirRules.svelte';

  let { onExit }: GameProps = $props();

  const game = new LirGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<LirRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const pending = $derived(game.pending);

  const options = $derived(
    pending
      ? ([
          ['Pull back', 'pull', 'P'],
          ['Let it ride', 'ride', 'R'],
        ] as const).map(([label, move, key]) => ({
          label,
          key,
          suggested: move === pending.suggestion,
          pick: () => game.choose(move as LirMove),
        }))
      : [],
  );

  const PAY_ROWS = $derived(
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
      .map((c) => ({ label: CATEGORY_NAMES[c], pays: `${game.rules.pays[c]}:1` }))
      .concat({ label: 'Tens or better', pays: '1:1' }),
  );
  const lit = $derived.by(() => {
    if (!game.hand || game.multiplier === null || game.multiplier < 0) return undefined;
    return game.hand.category === Category.Pair ? 'Tens or better' : CATEGORY_NAMES[game.hand.category];
  });

  // The three bets: one, two, and the dollar sign that always rides. Each pays at the hand's multiplier.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const spots = $derived(
    ['1', '2', '$'].map((label, i) => {
      const up = game.riding[i] !== false;
      const view = spotView(
        betting,
        game.roundBet,
        up ? 1 : 0,
        game.bet,
        up && game.multiplier !== null ? game.multiplier : undefined,
      );
      return { label, up, ...view };
    }),
  );
  const sides = $derived(
    LIR_BONUSES.map((b) => ({
      bet: b,
      ...spotView(betting, game.roundBet, game.roundSide[b.id] ?? 0, game.side.amount(b.id), game.bonusResults[b.id]?.net),
    })),
  );

  function placeBet() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || !game.hand) return null;
    const net = game.roundBet.mul(game.net);
    const m = game.multiplier ?? -1;
    const name = handName(game.hand);
    if (m > 0) return { title: `Pays ${m}:1`, net, detail: `${name} on ${game.up} bet${game.up > 1 ? 's' : ''}`, big: game.net >= 10 };
    return { title: 'No pay', net, detail: `${name}: tens or better pays`, big: false };
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
<LirRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Let It', 'Ride']}
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

      <FeltBand title="Let It Ride" lines={['Tens or better pays', 'Two bets can come back']} {result} />

      <div class="spots">
        <BetSpot
          label="3-Card"
          shape="diamond"
          size="sm"
          amount={sides[0]!.amount}
          net={sides[0]!.net}
          next={sides[0]!.next}
          onPlace={() => game.bets.addSide('threeCard', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('threeCard')}
        />
        {#each spots as spot, i (spot.label)}
          <BetSpot
            label={spot.label}
            size="lg"
            hint={!spot.up && !betting ? 'pulled back' : undefined}
            amount={spot.amount}
            net={spot.net}
            next={spot.next}
            active={pending?.bet === i + 1}
            onPlace={placeBet}
            onClear={() => game.bets.clearMain()}
          />
        {/each}
        <BetSpot
          label="5-Card"
          size="sm"
          amount={sides[1]!.amount}
          net={sides[1]!.net}
          next={sides[1]!.next}
          onPlace={() => game.bets.addSide('fiveCard', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('fiveCard')}
        />
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
      intro="Three bets down, three cards up. Pull a bet back if you don't like what you see — or let it ride."
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
        hint={`Bet ${pending.bet}: keep ${formatMoney(game.roundBet)} riding, or take it back`}
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
      lastUnit={game.lastBet}
      stats={[
        ['Hands', String(game.hands)],
        ['Bets pulled back', String(game.pulled)],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: h.hand, sub: `${h.riding} up`, net: h.net }))}
    >
      <section class="panel">
        <PayTable title="Pays on every bet still riding" rows={PAY_ROWS} {lit} />
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
