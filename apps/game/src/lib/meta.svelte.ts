import { equipCharm, equipped as equippedOf, nextSlotCost, settleRound, type Capsule } from '@idlesuits/engine';
import {
  applyCharms,
  FRESH_RUN,
  levelOf,
  maxLevelOf,
  ruleTotal,
  slotCharms,
  type CharmRunState,
  type CharmTrigger,
  type Equipped,
  type RoundReport,
} from '@idlesuits/sim';
import { autoplay } from './autoplay.svelte';
import type { BreakdownLine } from './breakdown';
import { bankroll } from './casino.svelte';
import type { Decimal } from './money';
import { player } from './player.svelte';
import { tuning } from './tuning.svelte';

export type { Capsule };

/** What charms did on the last hand, for the table to show. */
export interface CharmFlash {
  key: number;
  /** performance.now() when the hand settled, so a result banner can tell its own hand's charms from the last. */
  at: number;
  triggers: (CharmTrigger & { cashMoney: Decimal })[];
  tokens: number;
}

/**
 * The meta layer: Tokens, the charm collection, the loadout and slots, shared
 * by every table. Part of the player's state, so only the engine changes it
 * (on the server, for a member); this reads it and asks for changes.
 */
class Meta {
  /** The latest hand's charm activity, keyed so each one animates afresh. */
  flash = $state<CharmFlash | null>(null);
  private flashes = 0;
  /** A member's streaks at practice tables: their own, so practice never moves the real ones. */
  private practiceRun: CharmRunState = FRESH_RUN;

  get tokens(): number {
    return player.shown.meta.tokens;
  }

  get lifetimeTokens(): number {
    return player.shown.meta.lifetimeTokens;
  }

  get collection(): Record<string, number> {
    return player.shown.meta.collection;
  }

  get loadout(): (string | null)[] {
    return player.shown.meta.loadout;
  }

  /** Free pulls won on Lucky Stars' track. */
  get freePulls(): number {
    return player.shown.pass.freePulls;
  }

  get pulls(): number {
    return player.shown.meta.pulls;
  }

  get slots(): number {
    return this.loadout.length;
  }

  get nextSlotCost(): number | null {
    return nextSlotCost(player.shown, tuning.engine);
  }

  levelOf(id: string): number {
    return levelOf(this.collection[id] ?? 0, maxLevelOf(id));
  }

  get equipped(): Equipped[] {
    return equippedOf(player.shown);
  }

  /** Blind hands the poker tables deal beside the player's own, from Secret charms. */
  get extraHands(): number {
    return ruleTotal(this.equipped, 'extraHands');
  }

  /** What the equipped charms do to a slot spin, and which charm does each part. */
  get slotCharms(): ReturnType<typeof slotCharms> {
    return slotCharms(this.equipped);
  }

  /** Decks the Blackjack shoe goes without, from Secret charms. */
  get fewerDecks(): number {
    return ruleTotal(this.equipped, 'fewerDecks');
  }

  isEquipped(id: string): boolean {
    return this.loadout.includes(id);
  }

  /** Shows what charms did on a hand (or a draw the engine decided). */
  showFlash(triggers: CharmTrigger[], tokens: number, unit: Decimal) {
    this.flash = { key: ++this.flashes, at: performance.now(), triggers: triggers.map((t) => ({ ...t, cashMoney: unit.mul(t.cash) })), tokens };
  }

  /**
   * The one call every table settled in the browser makes when a hand
   * settles: applies the charms, pays the bankroll (the hand plus whatever
   * charms add) and the Tokens. Returns the charms' extra cash in base-bet
   * units and their lines for the hand's breakdown.
   *
   * A member's hand here is practice: the charms they wear still add their
   * cash, to the practice bankroll, but nothing else counts.
   */
  settleRound(report: RoundReport, unit: Decimal, net: number): { extra: number; lines: BreakdownLine[] } {
    let extra: number;
    let triggers: CharmTrigger[];
    let tokens = 0;
    if (bankroll.practice || player.member) {
      const out = applyCharms(report, this.equipped, this.practiceRun);
      this.practiceRun = out.state;
      extra = out.cash;
      triggers = out.triggers.map((t) => ({ ...t, tokens: 0 }));
      bankroll.settle(unit.mul(net + extra));
    } else {
      let result: ReturnType<typeof settleRound> | null = null;
      player.local((state, ctx) => (result = settleRound(state, report, unit, net, ctx)).state);
      const done = result as ReturnType<typeof settleRound> | null;
      extra = done?.extra ?? 0;
      triggers = done?.triggers ?? [];
      tokens = done?.tokens ?? 0;
    }
    // Auto play's own rules: hold a big win, stop when the player asked it to.
    autoplay.round(net + extra, bankroll.balance);
    this.showFlash(triggers, tokens, unit);
    return {
      extra,
      lines: triggers.filter((t) => t.cash > 0).map((t) => ({ label: `${t.name} · charm`, amount: t.cash })),
    };
  }

  /** Pulls from the machine; null if it couldn't (not the Tokens for it, or no answer from the server). */
  async pull(count: 1 | 10, free = false): Promise<Capsule[] | null> {
    const out = await player.act({ type: 'charms.pull', count, free });
    return out.ok && out.result && 'capsules' in out.result ? out.result.capsules : null;
  }

  /** Puts a charm in the first empty slot (or the given one). False if there is no room. */
  equip(id: string, slot?: number): boolean {
    if (!equipCharm(player.truth, id, slot)) return false;
    void player.act({ type: 'charms.equip', id, slot });
    return true;
  }

  unequip(id: string) {
    void player.act({ type: 'charms.unequip', id });
  }

  buySlot(): boolean {
    const cost = this.nextSlotCost;
    if (cost === null || this.tokens < cost) return false;
    void player.act({ type: 'charms.slot' });
    return true;
  }

  /** Pit boss: Tokens from nowhere. */
  grantTokens(amount: number) {
    void player.act({ type: 'admin.tokens', add: amount });
  }

  /** Pit boss: copies of a charm, as if pulled. */
  grant(id: string, copies: number) {
    void player.act({ type: 'admin.charm', id, copies });
  }

  /** Pit boss: every slot open, charms kept where they are. */
  openAllSlots() {
    void player.act({ type: 'admin.slots' });
  }
}

export const meta = new Meta();
