<script lang="ts">
  import { floor } from '../../lib/floor.svelte';
  import { formatMoney } from '../../lib/money';
  import { BET_STEPS, type InstantGame } from './instant.svelte';

  /** The bet, stepped through the room's levels, as on the slot floor. `locked` holds it where it is (a Keno buff waiting). */
  let { game, locked = false }: { game: InstantGame; locked?: boolean } = $props();
  const next = $derived(BET_STEPS[game.step + 1] ? floor.room.min.mul(BET_STEPS[game.step + 1]!) : null);
</script>

<div class="istepper" class:locked role="group" aria-label="Bet" title={locked ? 'The bet stays put while a buff is waiting or running' : undefined}>
  <span class="k">{locked ? 'Bet locked' : 'Bet'}</span>
  <button type="button" aria-label="Lower bet" onclick={() => game.setStep(game.step - 1)} disabled={locked || game.step === 0}>−</button>
  <b>{formatMoney(game.bet)}</b>
  <button type="button" aria-label="Raise bet" onclick={() => game.setStep(game.step + 1)} disabled={locked || !next || game.bank.lt(next)}>+</button>
</div>
