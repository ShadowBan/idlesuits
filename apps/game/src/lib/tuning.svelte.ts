import { PULL_COST, TEN_PULL_COST } from '@idlesuits/sim';
import { roomTuning } from './rooms';
import { load, save } from './save';

/**
 * Gameplay numbers the admin panel can change while testing, saved in the
 * browser. Every one defaults to the game as designed; the code reads them
 * here rather than from its constants wherever one can be tuned.
 */
export interface Knob {
  key: keyof TuningValues;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

export interface TuningValues {
  tokenRate: number;
  pullCost: number;
  tenPullCost: number;
  secretOdds: number;
  slotCostScale: number;
  roomOpensAt: number;
  roomTokenBonus: number;
  buyIn: number;
  speedBoost: number;
}

export const TUNING_DEFAULTS: Readonly<TuningValues> = {
  tokenRate: 1,
  pullCost: PULL_COST,
  tenPullCost: TEN_PULL_COST,
  secretOdds: 1,
  slotCostScale: 1,
  roomOpensAt: roomTuning.opensAtBets,
  roomTokenBonus: roomTuning.tokenBonusPerRoom,
  buyIn: 500,
  speedBoost: 1,
};

export const KNOBS: readonly Knob[] = [
  { key: 'tokenRate', label: 'Token rate', hint: '× every Token earned', min: 0, max: 1000, step: 0.1 },
  { key: 'pullCost', label: 'Pull cost', hint: 'Tokens for one capsule', min: 1, max: 100000, step: 1 },
  { key: 'tenPullCost', label: 'Ten-pull cost', hint: 'Tokens for ten', min: 1, max: 1000000, step: 1 },
  { key: 'secretOdds', label: 'Secret odds', hint: '× each Secret charm’s chance', min: 0, max: 100000, step: 1 },
  { key: 'slotCostScale', label: 'Slot costs', hint: '× the price of each slot', min: 0, max: 100, step: 0.1 },
  { key: 'roomOpensAt', label: 'Room opens at', hint: 'minimum bets in the bank', min: 1, max: 1000, step: 1 },
  { key: 'roomTokenBonus', label: 'Room Token bonus', hint: '+ per room up', min: 0, max: 10, step: 0.05 },
  { key: 'buyIn', label: 'Buy-in', hint: 'a fresh stake, in dollars', min: 5, max: 1e9, step: 5 },
  { key: 'speedBoost', label: 'Speed boost', hint: '× every table’s pace', min: 0.25, max: 50, step: 0.25 },
];

class Tuning {
  values = $state<TuningValues>({ ...TUNING_DEFAULTS, ...load<Partial<TuningValues>>('tuning', {}) });

  constructor() {
    this.sync();
  }

  set<K extends keyof TuningValues>(key: K, value: TuningValues[K]) {
    if (!Number.isFinite(value)) return;
    this.values[key] = value;
    this.persist();
  }

  reset() {
    this.values = { ...TUNING_DEFAULTS };
    this.persist();
  }

  /** Knobs moved off their defaults. */
  get changed(): number {
    return KNOBS.filter((k) => this.values[k.key] !== TUNING_DEFAULTS[k.key]).length;
  }

  private persist() {
    this.sync();
    save('tuning', $state.snapshot(this.values));
  }

  /** The room ladder is pure; it reads its two numbers from here. */
  private sync() {
    roomTuning.opensAtBets = this.values.roomOpensAt;
    roomTuning.tokenBonusPerRoom = this.values.roomTokenBonus;
  }
}

export const tuning = new Tuning();
