<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { Decimal, formatMoney } from '../../lib/money';

  /** An amount that rolls up from zero, as a slot's win meter does. */
  interface Props {
    amount: Decimal;
    /** How long the roll takes, in milliseconds. */
    ms: number;
  }

  let { amount, ms }: Props = $props();
  const shown = new Tween(0, { easing: cubicOut });
  $effect(() => {
    void shown.set(amount.toNumber(), { duration: ms });
  });
  const done = $derived(shown.current >= amount.toNumber() - 1e-9);
</script>

<!-- Exact once it lands; on the way, to the cent. -->
<span class:done>{done ? formatMoney(amount) : formatMoney(new Decimal(shown.current.toFixed(2)))}</span>
