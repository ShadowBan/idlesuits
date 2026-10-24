<script lang="ts">
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';
  import type { Card, PaiGowSet } from '@idlesuits/sim';
  import PlayingCard from '../../components/PlayingCard.svelte';
  import { fromShoe } from '../../lib/deal';

  interface Props {
    title: string;
    side: 'player' | 'dealer';
    /** Seven cards; nulls are face down. */
    cards: (Card | null)[];
    /** Once set, the low hand is the two cards before the gap. */
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
    /** Changes with every deal, so the cards are thrown in from the shoe. */
    deal?: number;
    dealOrder?: number;
    /** The face-down card about to turn. */
    focus?: number;
    badge?: Snippet;
  }

  let {
    title,
    side,
    cards,
    set,
    lowName,
    highName,
    lowResult,
    highResult,
    picked = [],
    onPick,
    flipMs,
    deal = 0,
    dealOrder = 0,
    focus = -1,
    badge,
  }: Props = $props();

  const value = (card: Card | null) => (card === null ? 0 : card.joker ? 15 : card.rank);
  const byValue = (indices: number[]) => [...indices].sort((a, b) => value(cards[b]!) - value(cards[a]!));

  /**
   * One row of seven, in a fixed frame: the low hand's two places, a gap, the
   * high hand's five. Picked or set low cards glide into the first two places;
   * nothing else on the table moves.
   */
  const order = $derived.by(() => {
    const all = cards.map((_, i) => i);
    const low = set ? [...set.low] : picked.slice(0, 2);
    // The dealer's cards stay in deal order while they turn over, and arrange once the hand is set.
    const others = all.filter((i) => !low.includes(i));
    const rest = set || side === 'player' ? byValue(others) : others;
    return [...byValue(low), ...rest];
  });
  const lowCount = $derived(set ? 2 : Math.min(picked.length, 2));
</script>

<section class="hand {side}">
  <header>
    <h2>{title}</h2>
    <span class="badge">{@render badge?.()}</span>
  </header>

  <div class="frame">
    {#key deal}
      <div class="cards">
        {#each order as i, pos (i)}
          <div
            class="slot"
            class:gap={pos === 2}
            animate:flip={{ duration: 320 }}
            in:fromShoe={{ delay: (dealOrder * 7 + i) * flipMs * 0.2, duration: Math.max(120, flipMs * 1.1) }}
          >
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
              <PlayingCard card={cards[i]!} {flipMs} focus={focus === i} />
            {/if}
          </div>
        {/each}
      </div>
    {/key}

    <!-- Captions in fixed places under each hand, so naming a hand never moves a card. -->
    <div class="captions">
      <p class="low" class:won={lowResult === 'won'} class:lost={lowResult === 'lost'} class:filled={lowCount === 2}>
        <span class="k">Low</span>
        {lowName ?? ''}
      </p>
      <p class="high" class:won={highResult === 'won'} class:lost={highResult === 'lost'} class:filled={!!set}>
        <span class="k">High</span>
        {highName ?? ''}
      </p>
    </div>
  </div>
</section>

<style>
  .hand {
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 100%;
  }
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    column-gap: 10px;
    width: 100%;
    height: 24px;
    white-space: nowrap;
  }
  h2 {
    justify-self: end;
    margin: 0;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .badge {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }
  .dealer h2 {
    color: var(--dealer);
  }
  .player h2 {
    color: var(--player);
  }
  .frame {
    --split: calc(var(--card-gap) * 3);
    display: grid;
    gap: 3px;
  }
  .cards {
    display: flex;
    gap: var(--card-gap);
    padding-top: 8px;
  }
  .slot.gap {
    margin-left: var(--split);
  }
  .captions {
    display: grid;
    grid-template-columns: calc(var(--card-w) * 2 + var(--card-gap)) 1fr;
    column-gap: calc(var(--split) + var(--card-gap));
    height: 18px;
  }
  .captions p {
    margin: 0;
    padding-top: 3px;
    border-top: 2px solid rgb(255 255 255 / 0.12);
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--ink);
    transition: border-color 200ms ease;
  }
  .captions .filled {
    border-top-color: rgb(236 216 160 / 0.45);
  }
  .captions .won {
    border-top-color: var(--win);
    color: var(--win);
  }
  .captions .lost {
    border-top-color: color-mix(in srgb, var(--loss) 70%, transparent);
    color: color-mix(in srgb, var(--ink) 70%, transparent);
  }
  .k {
    font: 600 9px/1 var(--font-ui);
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
</style>
