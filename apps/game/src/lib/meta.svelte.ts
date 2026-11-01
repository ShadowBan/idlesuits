import {
  applyCharms,
  drawCharm,
  findCharm,
  FRESH_RUN,
  levelOf,
  maxLevelOf,
  ruleTotal,
  MAX_SLOTS,
  SLOT_COSTS,
  STARTER_TOKENS,
  type CharmRunState,
  type CharmTrigger,
  type Equipped,
  type RoundReport,
} from '@idlesuits/sim';
import type { BreakdownLine } from './breakdown';
import { bankroll } from './casino.svelte';
import { floor } from './floor.svelte';
import type { Decimal } from './money';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

interface MetaSave {
  tokens: number;
  lifetimeTokens: number;
  /** Charm id → copies found. */
  collection: Record<string, number>;
  /** One entry per unlocked slot; null is an empty slot. */
  loadout: (string | null)[];
  pulls: number;
  seed: string;
  run: CharmRunState;
  hands: number;
}

function fresh(): MetaSave {
  return {
    tokens: STARTER_TOKENS,
    lifetimeTokens: 0,
    collection: {},
    loadout: [null],
    pulls: 0,
    seed: Math.random().toString(36).slice(2, 10),
    run: FRESH_RUN,
    hands: 0,
  };
}

/** One capsule's contents, as the machine shows it. */
export interface Capsule {
  id: string;
  /** First copy of this charm. */
  isNew: boolean;
  /** Level after this copy, and whether it just went up. */
  level: number;
  levelUp: boolean;
}

/** What charms did on the last hand, for the table to show. */
export interface CharmFlash {
  key: number;
  /** performance.now() when the hand settled, so a result banner can tell its own hand's charms from the last. */
  at: number;
  triggers: (CharmTrigger & { cashMoney: Decimal })[];
  tokens: number;
}

/**
 * The meta layer: Tokens, the charm collection, the loadout and slots. Never
 * lost, saved in the browser, shared by every table.
 */
class Meta {
  tokens = $state(0);
  lifetimeTokens = $state(0);
  collection = $state<Record<string, number>>({});
  loadout = $state<(string | null)[]>([null]);
  pulls = $state(0);
  hands = $state(0);
  /** The latest hand's charm activity, keyed so each one animates afresh. */
  flash = $state<CharmFlash | null>(null);
  private seed: string;
  private run: CharmRunState;
  private flashes = 0;

  constructor() {
    const data = { ...fresh(), ...load<Partial<MetaSave>>('meta', {}) };
    this.tokens = data.tokens;
    this.lifetimeTokens = data.lifetimeTokens;
    this.collection = data.collection;
    this.loadout = data.loadout.length ? data.loadout : [null];
    this.pulls = data.pulls;
    this.hands = data.hands;
    this.seed = data.seed;
    this.run = data.run;
    // A brand-new save is written at once, so its seed (and starter Tokens) stick.
    this.persist();
  }

  get slots(): number {
    return this.loadout.length;
  }

  get nextSlotCost(): number | null {
    return this.slots < MAX_SLOTS ? Math.round(SLOT_COSTS[this.slots]! * tuning.values.slotCostScale) : null;
  }

  levelOf(id: string): number {
    return levelOf(this.collection[id] ?? 0, maxLevelOf(id));
  }

  get equipped(): Equipped[] {
    return this.loadout.filter((id): id is string => id !== null).map((id) => ({ id, level: this.levelOf(id) }));
  }

  /** Blind hands the poker tables deal beside the player's own, from Secret charms. */
  get extraHands(): number {
    return ruleTotal(this.equipped, 'extraHands');
  }

  /** Decks the Blackjack shoe goes without, from Secret charms. */
  get fewerDecks(): number {
    return ruleTotal(this.equipped, 'fewerDecks');
  }

  isEquipped(id: string): boolean {
    return this.loadout.includes(id);
  }

  /**
   * The one call every table makes when a hand settles: applies the charms,
   * pays the bankroll (the hand plus whatever charms add) and the Tokens.
   * Returns the charms' extra cash in base-bet units and their lines for the
   * hand's breakdown.
   */
  settleRound(report: RoundReport, unit: Decimal, net: number): { extra: number; lines: BreakdownLine[] } {
    const out = applyCharms(report, this.equipped, this.run);
    this.run = out.state;
    this.hands++;
    // Higher rooms comp more: their Token bonus multiplies everything earned on the hand.
    const tokens = out.tokens * floor.room.tokenBonus * tuning.values.tokenRate;
    if (tokens > 0) {
      this.tokens += tokens;
      this.lifetimeTokens += tokens;
    }
    bankroll.settle(unit.mul(net + out.cash));
    const cashTriggers = out.triggers.filter((t) => t.cash > 0);
    this.flash = {
      key: ++this.flashes,
      at: performance.now(),
      triggers: out.triggers.map((t) => ({ ...t, cashMoney: unit.mul(t.cash) })),
      tokens,
    };
    this.persist();
    return {
      extra: out.cash,
      lines: cashTriggers.map((t) => ({ label: `${t.name} · charm`, amount: t.cash })),
    };
  }

  /** Pulls from the machine; null if there aren't the Tokens for it. */
  pull(count: 1 | 10): Capsule[] | null {
    const cost = count === 10 ? tuning.values.tenPullCost : tuning.values.pullCost;
    if (this.tokens < cost) return null;
    this.tokens -= cost;
    const capsules: Capsule[] = [];
    const collection = { ...this.collection };
    for (let i = 0; i < count; i++) {
      const id = drawCharm(this.seed, this.pulls++, tuning.values.secretOdds);
      const before = collection[id] ?? 0;
      collection[id] = before + 1;
      const level = levelOf(before + 1, maxLevelOf(id));
      capsules.push({ id, isNew: before === 0, level, levelUp: before > 0 && level > levelOf(before, maxLevelOf(id)) });
    }
    this.collection = collection;
    this.persist();
    return capsules;
  }

  /** Puts a charm in the first empty slot (or the given one). False if there is no room. */
  equip(id: string, slot?: number): boolean {
    if (!findCharm(id) || !this.collection[id]) return false;
    const loadout = this.loadout.map((s) => (s === id ? null : s));
    const at = slot ?? loadout.indexOf(null);
    if (at < 0 || at >= loadout.length) return false;
    loadout[at] = id;
    this.loadout = loadout;
    this.persist();
    return true;
  }

  unequip(id: string) {
    this.loadout = this.loadout.map((s) => (s === id ? null : s));
    this.persist();
  }

  /** Admin: Tokens from nowhere. */
  grantTokens(amount: number) {
    this.tokens = Math.max(0, this.tokens + amount);
    this.persist();
  }

  /** Admin: copies of a charm, as if pulled. */
  grant(id: string, copies: number) {
    if (!findCharm(id)) return;
    this.collection = { ...this.collection, [id]: Math.max(0, (this.collection[id] ?? 0) + copies) };
    if (!this.collection[id]) this.unequip(id);
    this.persist();
  }

  /** Admin: every slot open, charms kept where they are. */
  openAllSlots() {
    this.loadout = [...this.loadout, ...Array<null>(MAX_SLOTS - this.loadout.length).fill(null)];
    this.persist();
  }

  buySlot(): boolean {
    const cost = this.nextSlotCost;
    if (cost === null || this.tokens < cost) return false;
    this.tokens -= cost;
    this.loadout = [...this.loadout, null];
    this.persist();
    return true;
  }

  private persist() {
    saveSoon('meta', (): MetaSave => ({
      tokens: this.tokens,
      lifetimeTokens: this.lifetimeTokens,
      collection: $state.snapshot(this.collection),
      loadout: $state.snapshot(this.loadout),
      pulls: this.pulls,
      seed: this.seed,
      run: this.run,
      hands: this.hands,
    }));
  }
}

export const meta = new Meta();
