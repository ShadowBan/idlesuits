<script lang="ts">
  import { floor } from '../../lib/floor.svelte';
  import { formatMoney } from '../../lib/money';
  import { BET_STEPS, type InstantGame } from './instant.svelte';

  /** The bet, stepped through the room's levels, as on the slot floor. */
  let { game }: { game: InstantGame } = $props();
  const next = $derived(BET_STEPS[game.step + 1] ? floor.room.min.mul(BET_STEPS[game.step + 1]!) : null);
</script>

<div class="istepper" role="group" aria-label="Bet">
  <span class="k">Bet</span>
  <button type="button" aria-label="Lower bet" onclick={() => game.setStep(game.step - 1)} disabled={game.step === 0}>−</button>
  <b>{formatMoney(game.bet)}</b>
  <button type="button" aria-label="Raise bet" onclick={() => game.setStep(game.step + 1)} disabled={!next || game.bank.lt(next)}>+</button>
</div>
