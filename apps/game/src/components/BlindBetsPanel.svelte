<script lang="ts">
  import { blindSeats, type BlindBets, type BlindMode } from '../lib/blind.svelte';
  import { heldValue } from '../lib/betting.svelte';
  import { floor } from '../lib/floor.svelte';
  import { Decimal, formatMoney } from '../lib/money';
  import type { SideStakes } from '../lib/sidebets.svelte';

  interface Props {
    /** The table's blind hands: how each seat bets. */
    hands: { seat: (index: number) => BlindBets; setSeat: (index: number, change: Partial<BlindBets>) => void };
    /** The player's own main bet and side bets, which a matching seat copies and "Own bets" starts from. */
    bet: Decimal;
    sides: SideStakes;
    bank: Decimal;
  }

  let { hands, bet, sides, bank }: Props = $props();

  const MODES: { id: BlindMode; label: string }[] = [
    { id: 'match', label: 'Same as mine' },
    { id: 'own', label: 'Own bets' },
    { id: 'out', label: 'Sit out' },
  ];

  const count = $derived(blindSeats());
  const chip = $derived(heldValue(bank));

  function choose(index: number, mode: BlindMode) {
    const seat = hands.seat(index);
    if (mode === seat.mode) return;
    // Own bets start from the player's, the first time and after matching them.
    if (mode === 'own' && seat.mode === 'match') {
      hands.setSeat(index, { mode, bet, sides: { ...sides.stakes } });
    } else hands.setSeat(index, { mode });
  }

  /** Steps the main bet by the chip in hand, within the room's limits. */
  function stepMain(index: number, dir: 1 | -1) {
    const room = floor.room;
    const now = hands.seat(index).bet;
    const next = dir > 0 ? now.add(chip) : now.sub(chip);
    hands.setSeat(index, { bet: Decimal.min(Decimal.max(next, room.min), room.max) });
  }

  function stepSide(index: number, id: string, dir: 1 | -1) {
    const seat = hands.seat(index);
    const now = seat.sides[id] ?? new Decimal(0);
    const next = Decimal.min(Decimal.max(dir > 0 ? now.add(chip) : now.sub(chip), 0), floor.room.sideMax);
    hands.setSeat(index, { sides: { ...seat.sides, [id]: next } });
  }
</script>

<!--
  How the Lucky Seat's extra hands bet, set between hands. Once dealt they
  play blind and all in: no decisions, every bet down.
-->
{#if count > 0}
  <section class="panel">
    <h2>Extra hands <span>played blind, all in</span></h2>
    {#each Array.from({ length: count }, (_, i) => i) as i (i)}
      {@const seat = hands.seat(i)}
      <div class="seat">
        <div class="head">
          <span class="name">Blind {i + 1}</span>
          <div class="modes" role="group" aria-label="How Blind {i + 1} bets">
            {#each MODES as mode (mode.id)}
              <button type="button" aria-pressed={seat.mode === mode.id} onclick={() => choose(i, mode.id)}>{mode.label}</button>
            {/each}
          </div>
        </div>
        {#if seat.mode === 'match'}
          <p class="note">Bets {formatMoney(bet)}{sides.total.gt(0) ? ` and ${formatMoney(sides.total)} on side bets` : ''}, as your hand does.</p>
        {:else if seat.mode === 'out'}
          <p class="note">Sits this one out. Deal it back in any hand.</p>
        {:else}
          <div class="row">
            <span>Main bet</span>
            <div class="step">
              <button type="button" aria-label="Less on Blind {i + 1}" onclick={() => stepMain(i, -1)} disabled={seat.bet.lte(floor.room.min)}>−</button>
              <b>{formatMoney(Decimal.min(Decimal.max(seat.bet, floor.room.min), floor.room.max))}</b>
              <button type="button" aria-label="More on Blind {i + 1}" onclick={() => stepMain(i, 1)} disabled={seat.bet.gte(floor.room.max)}>+</button>
            </div>
          </div>
          {#each sides.bets as side (side.id)}
            {@const amount = seat.sides[side.id] ?? new Decimal(0)}
            <div class="row">
              <span class:muted={amount.eq(0)}>{side.name}</span>
              <div class="step">
                <button type="button" aria-label="Less on {side.name} for Blind {i + 1}" onclick={() => stepSide(i, side.id, -1)} disabled={amount.lte(0)}>−</button>
                <b class:muted={amount.eq(0)}>{amount.gt(0) ? formatMoney(amount) : 'Off'}</b>
                <button type="button" aria-label="More on {side.name} for Blind {i + 1}" onclick={() => stepSide(i, side.id, 1)} disabled={amount.gte(floor.room.sideMax)}>+</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
    <p class="note">Steps by the chip in hand ({formatMoney(chip)}). Changes deal from the next hand.</p>
  </section>
{/if}

<style>
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 12px;
  }
  h2 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .seat {
    display: grid;
    gap: 6px;
  }
  .seat + .seat {
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .head {
    display: grid;
    gap: 6px;
  }
  .name {
    font: 600 13px/1.2 var(--font-ui);
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .modes button {
    border: 0;
    border-radius: 0;
    padding: 6px 4px;
    font: 12px/1.2 var(--font-ui);
  }
  .modes button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font: 13px/1.3 var(--font-ui);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .step b {
    min-width: 56px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .step button {
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
</style>
