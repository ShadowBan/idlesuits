import type { BonusBet } from '@idlesuits/sim';
import { formatEdge } from './sidebets.svelte';

/** One thing to know at a glance: a bet, a feature, a symbol. */
export interface GlanceItem {
  name: string;
  text: string;
  /** A short fact beside the name: what it pays, how often. */
  tag?: string;
}

/** A group of them under a heading: your bets, the side bets, the bonus. */
export interface GlanceGroup {
  heading: string;
  /** One line under the heading. */
  note?: string;
  items: GlanceItem[];
}

/**
 * A table's side bets at a glance: each by name, what it pays on, its top
 * payout and its house edge, straight from the bet's own definition, so the
 * rules can never disagree with the felt.
 */
export function sideBetsGlance(bets: readonly BonusBet<never>[], note = 'Optional, and off until you put a chip on one. Each pays on the cards alone, win or lose.'): GlanceGroup {
  return {
    heading: 'Side bets',
    note,
    items: bets.map((b) => ({
      name: b.name,
      text: b.blurb,
      tag: `up to ${b.rows[0]!.pays.toLocaleString('en-US')}${b.forOne ? ' for 1' : ':1'} · edge ${formatEdge(b.edge)}`,
    })),
  };
}
