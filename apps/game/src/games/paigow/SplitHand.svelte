<script lang="ts">
  import type { Card, HandWinner, PaiGowSet } from '@idlesuits/sim';
  import PlayingCard from '../../components/PlayingCard.svelte';

  interface Props {
    title: string;
    side: 'player' | 'dealer';
    /** Seven cards; nulls are face down. */
    cards: (Card | null)[];
    /** Once set, the cards split into the low hand and the high hand. */
    set: PaiGowSet | null;
    lowName?: string;
    highName?: string;
    /** Who took each hand, from this side's point of view. */
    lowResult?: 'won' | 'lost';
    highResult?: 'won' | 'lost';
    /** While the player is setting: the cards picked for the low hand, and a way to pick. */
    picked?: number[];
    onPick?: (index: number) => void;
    flipMs: number;
  }

  let { title, side, cards, set, lowName, highName, lowResult, highResult, picked = [], onPick, flipMs }: Props = $props();

  const value = (card: Card | null) => (card === null ? 0 : card.joker ? 15 : card.rank);
  /** Indices high to low, so a hand reads left to right; the simulator's order is kept underneath. */
  const byValue = (indices: number[]) => [...indices].sort((a, b) => value(cards[b]!) - value(cards[a]!));
  const all = $derived(byValue(cards.map((_, i) => i)));
  const low = $derived(set ? byValue([...set.low]) : []);
  const high = $derived(set ? byValue(cards.map((_, i) => i).filter((i) => !set.low.includes(i))) : []);
</script>

{#snippet card(i: number)}
  {#if onPick}
    <button
      type="button"
      class="pick"
      class:picked={picked.includes(i)}
      onclick={() => onPick(i)}
      aria-pressed={picked.includes(i)}
      aria-label={picked.includes(i) ? 'In the low hand' : 'In the high hand'}
    >
      <PlayingCard card={cards[i]!} {flipMs} highlight={picked.includes(i)} />
    </button>
  {:else}
    <PlayingCard card={cards[i]!} {flipMs} />
  {/if}
{/snippet}

<section class="hand {side}">
  <header><h2>{title}</h2></header>
  {#if set}
    <div class="split">
      <div class="group low" class:won={lowResult === 'won'} class:lost={lowResult === 'lost'}>
        <div class="cards">{#each low as i (i)}{@render card(i)}{/each}</div>
        <p><span class="k">Low</span> {lowName ?? ''}</p>
      </div>
      <div class="group high" class:won={highResult === 'won'} class:lost={highResult === 'lost'}>
        <div class="cards">{#each high as i (i)}{@render card(i)}{/each}</div>
        <p><span class="k">High</span> {highName ?? ''}</p>
      </div>
    </div>
  {:else}
    <div class="cards">{#each all as i (i)}{@render card(i)}{/each}</div>
  {/if}
</section>

<style>
  .hand {
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  h2 {
    margin: 0;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .dealer h2 {
    color: var(--dealer);
  }
  .player h2 {
    color: var(--player);
  }
  .cards {
    display: flex;
    gap: var(--card-gap);
    justify-content: center;
  }
  .split {
    display: flex;
    gap: calc(var(--card-gap) * 3);
    align-items: flex-start;
    justify-content: center;
  }
  .group {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 4px 6px;
    border-radius: 10px;
    border: 2px solid transparent;
  }
  .group.won {
    border-color: var(--win);
  }
  .group.lost {
    border-color: color-mix(in srgb, var(--loss) 70%, transparent);
  }
  .group p {
    margin: 0;
    font: 700 13px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }
  /* Two cards are narrower than "Pair of 8s": let the low hand's name wrap rather than widen it. */
  .group.low p {
    max-width: calc(var(--card-w) * 2 + var(--card-gap) + 8px);
    white-space: normal;
    text-align: center;
    line-height: 1.15;
  }
  .group .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
    color: var(--muted);
  }
  .pick {
    padding: 0;
    border: 0;
    background: none;
    min-height: 0;
    cursor: pointer;
    border-radius: calc(var(--card-w) * 0.1);
  }
  .pick:hover:not(:disabled) {
    background: none;
  }
  .pick:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .pick.picked {
    box-shadow: 0 0 0 2px var(--gold);
  }
  @media (orientation: landscape) and (max-height: 520px) {
    .hand {
      gap: 3px;
    }
    .group {
      padding: 2px 4px;
      gap: 2px;
    }
    .group p {
      font-size: 11px;
    }
  }
</style>
