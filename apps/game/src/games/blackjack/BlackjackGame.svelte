<script lang="ts">
  import { onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { BJ_BONUSES, type Move } from '@idlesuits/sim';
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
  import BjHandRow from './BjHandRow.svelte';
  import BjRules from './BjRules.svelte';
  import { BjGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new BjGame();
  const view = game.view;
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<BjRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 260, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const decision = $derived(game.decision);

  const KEYS: Record<string, Move> = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
  const options = $derived.by(() => {
    if (!decision) return [];
    const free = game.freeDoubleReady();
    const list: { label: string; move: Move; key: string; sub?: string }[] = [
      { label: 'Hit', move: 'hit', key: 'H' },
      { label: 'Stand', move: 'stand', key: 'S' },
    ];
    if (decision.allowed.double) {
      list.push({ label: free ? 'Free double' : 'Double', move: 'double', key: 'D', sub: free ? 'on the house' : undefined });
    }
    if (decision.allowed.split) list.push({ label: 'Free split', move: 'split', key: 'P', sub: 'on the house' });
    return list.map((o) => ({ ...o, suggested: o.move === decision.suggestion, pick: () => game.choose(o.move) }));
  });
  const hint = $derived(
    !decision
      ? ''
      : decision.regime === 'free'
        ? 'House money: a loss on this hand costs you nothing'
        : `Chart says ${decision.suggestion}`,
  );

  // The spots on the felt. The bet spot settles at the hands' combined result.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.round === 0));
  const handsNet = $derived(view.net === null ? undefined : view.hands.reduce((a, h) => a + (h.net ?? 0), 0));
  const bet = $derived(spotView(betting, game.roundBet, 1, game.bet, handsNet));
  const sides = $derived(
    BJ_BONUSES.map((b) => ({
      bet: b,
      ...spotView(betting, game.roundBet, game.roundSide[b.id] ?? 0, game.side.amount(b.id), view.bonusResults[b.id]?.net),
    })),
  );

  function placeBet() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (view.net === null || betting) return null;
    const net = game.roundBet.mul(view.net);
    const main = handsNet ?? view.net;
    const title = main > 0 ? 'You win' : main < 0 ? 'Dealer wins' : 'Push';
    const dealer = view.dealerTotal;
    const hands = view.hands;
    let detail = '';
    if (hands.length > 1) {
      const count = (test: (n: number) => boolean) => hands.filter((h) => test(h.net ?? 0)).length;
      const tally = [
        [count((n) => n > 0), 'won'],
        [count((n) => n === 0), 'pushed'],
        [count((n) => n < 0), 'lost'],
      ] as const;
      detail = tally
        .filter(([n]) => n > 0)
        .map(([n, word]) => `${n} ${word}`)
        .join(', ');
      if (dealer?.bust) detail += ` · dealer busts with ${dealer.total}`;
    } else {
      const h = hands[0]!;
      const mine = h.total?.total ?? 0;
      const theirs = dealer?.total ?? 0;
      detail = {
        blackjack: 'Blackjack pays 3 to 2',
        push22: 'Dealer 22: every hand still standing pushes',
        bust: `You bust with ${mine}`,
        dealerBlackjack: 'Dealer has blackjack',
        win: dealer?.bust ? `Dealer busts with ${theirs}` : `${mine} beats ${theirs}`,
        lose: `Dealer's ${theirs} beats ${mine}`,
        push: `${mine} each`,
      }[h.outcome ?? 'push'];
    }
    const big = view.net >= 3 || hands.some((h) => h.outcome === 'blackjack');
    return { title, net, detail, big };
  });

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const move = KEYS[e.key.toLowerCase()];
    if (move && seq.awaiting === 'move' && options.some((o) => o.move === move)) return game.choose(move);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<BjRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Free Bet', 'Blackjack']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
>
  {#snippet felt()}
    <div class="layout" style:--count={Math.max(1, view.hands.length)}>
      <div class="area dealer">
        <BjHandRow
          title="Dealer"
          cards={view.dealer}
          total={view.dealerTotal}
          side="dealer"
          {flipMs}
          note={view.dealerTotal?.total === 22 ? 'Push 22' : view.peeked ? 'Blackjack' : undefined}
        />
      </div>

      <FeltBand
        title="Blackjack pays 3 to 2"
        lines={[game.rules.hitsSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s', 'Dealer 22 pushes']}
        {result}
      />

      <div class="area hands">
        {#each view.hands as hand, i (i)}
          <div class="seat" animate:flip={{ duration: 260 }}>
            <BjHandRow
              title={view.hands.length > 1 ? `Hand ${i + 1}` : 'You'}
              cards={hand.cards}
              total={hand.total}
              side="player"
              {flipMs}
              {hand}
              bet={game.roundBet}
              stakes={view.hands.length > 1 || hand.bet > 1 || hand.free > 0}
              active={view.active === i && view.hands.length > 1}
            />
          </div>
        {/each}
      </div>

      <div class="spots">
        <BetSpot
          label={sides[0]!.bet.short}
          size="sm"
          amount={sides[0]!.amount}
          net={sides[0]!.net}
          next={sides[0]!.next}
          onPlace={() => game.bets.addSide(sides[0]!.bet.id, heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide(sides[0]!.bet.id)}
        />
        <BetSpot
          label="Bet"
          size="lg"
          amount={bet.amount}
          net={bet.net}
          next={bet.next}
          active={seq.awaiting === 'move'}
          onPlace={placeBet}
          onClear={() => game.bets.clearMain()}
        />
        <BetSpot
          label={sides[1]!.bet.short}
          size="sm"
          amount={sides[1]!.amount}
          net={sides[1]!.net}
          next={sides[1]!.next}
          onPlace={() => game.bets.addSide(sides[1]!.bet.id, heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide(sides[1]!.bet.id)}
        />
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="The house pays for your doubles and splits. In exchange, a dealer 22 is a push."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && decision}
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
      last={view.last}
      lastUnit={game.lastBet}
      stats={[
        ['Hands', String(game.hands)],
        ['Blackjacks', String(game.blackjacks)],
        ['Won on house money', formatMoney(game.freeWins)],
        ['Dealer 22 pushes', String(game.push22s)],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: h.player, sub: `v ${h.dealer}`, net: h.net }))}
    >
      <section class="panel">
        <h2>Free bets</h2>
        <p class="note">
          The house covers doubles on {game.rules.freeDoubleTotals.join(', ')} and every split. Those free bets pay you on
          a win and cost you nothing on a loss. In exchange, a dealer 22 pushes every hand still standing.
        </p>
      </section>
      <SideBetsPanel stakes={game.side} results={view.bonusResults} />
    </TablePanels>
  {/snippet}
</TableShell>

{#snippet pause()}
  <button type="button" class="pause" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
{/snippet}

<style>
  .layout {
    /* Cards as large as the felt allows: the fans across, two rows of cards plus the spots down. */
    --card-w: clamp(
      28px,
      min(calc((100cqw - 24px - (var(--count) - 1) * 10px) / (var(--count) * 2.75)), calc((100cqh - 318px) / 2.8)),
      104px
    );
    display: grid;
    height: 100%;
    grid-template-rows: auto minmax(36px, 1fr) auto auto;
    grid-template-areas: 'dealer' 'band' 'hands' 'spots';
    align-items: center;
    justify-items: center;
    gap: 6px;
  }
  .area {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .dealer {
    grid-area: dealer;
  }
  .hands {
    grid-area: hands;
    gap: 10px;
  }
  .spots {
    grid-area: spots;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(18px, 6cqw, 40px);
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
    font: 12px/1.5 var(--font-ui);
    color: var(--muted);
  }
  /* Landscape phones: dealer over your hands on the left, the bets in a column on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(
        26px,
        min(calc((100cqw - 130px - (var(--count) - 1) * 10px) / (var(--count) * 2.75)), calc((100cqh - 140px) / 2.8)),
        90px
      );
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'hands spots';
      column-gap: 10px;
    }
    .spots {
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
  }
</style>
