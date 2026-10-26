<script lang="ts">
  import type { Card } from '@idlesuits/sim';
  import { CARD_FACES, cardStyle, setCardFace, setSuitColors, SUIT_COLORS } from '../lib/cardStyle.svelte';
  import PlayingCard from './PlayingCard.svelte';

  /** One of each suit, with a ten: the widest rank is the one most likely to crowd. */
  const SAMPLE: Card[] = (
    [
      [14, 'S'],
      [10, 'H'],
      [12, 'D'],
      [7, 'C'],
    ] as const
  ).map(([rank, suit]) => ({ uid: `sample-${rank}${suit}`, rank, suit, source: 'table' }));

  const face = $derived(CARD_FACES.find((f) => f.id === cardStyle.face)!);
  const suits = $derived(SUIT_COLORS.find((s) => s.id === cardStyle.suits)!);
</script>

<div class="picker">
  <!-- A live preview: the same component the tables draw with. -->
  <div class="preview" aria-hidden="true">
    {#each SAMPLE as card, i (i)}
      <PlayingCard {card} flipMs={0} />
    {/each}
  </div>

  <fieldset>
    <legend>Faces</legend>
    <div class="seg">
      {#each CARD_FACES as option (option.id)}
        <button type="button" aria-pressed={cardStyle.face === option.id} onclick={() => setCardFace(option.id)}>
          {option.name}
        </button>
      {/each}
    </div>
    <p class="blurb">{face.blurb}</p>
  </fieldset>

  <fieldset>
    <legend>Suit colours</legend>
    <div class="seg">
      {#each SUIT_COLORS as option (option.id)}
        <button type="button" aria-pressed={cardStyle.suits === option.id} onclick={() => setSuitColors(option.id)}>
          {option.name}
        </button>
      {/each}
    </div>
    <p class="blurb">{suits.blurb}</p>
  </fieldset>
</div>

<style>
  .picker {
    display: grid;
    gap: 12px;
  }
  .preview {
    --card-w: 52px;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 8px;
    border-radius: 10px;
    background: radial-gradient(ellipse at center, var(--felt) 0%, var(--felt-deep) 100%);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 6px;
    font: 600 12px/1 var(--font-ui);
    color: var(--ink);
  }
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    flex: 1 1 0;
    min-width: 0;
    min-height: 40px;
    padding: 6px 4px;
    border: 0;
    border-radius: 0;
    white-space: nowrap;
    font-size: 12px;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
    font-weight: 600;
  }
  .blurb {
    margin: 0;
    min-height: 2.8em;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
</style>
