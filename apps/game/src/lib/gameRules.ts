import {
  C4P_RULES,
  CATEGORY_NAMES,
  CSP_RULES,
  DEFAULT_RULES,
  DJ_CATEGORY_NAMES,
  DJ_RULES,
  FREE_BET_RULES,
  LIR_RULES,
  PAI_GOW_RULES,
  STUD_RULES,
  TCP_RULES,
  THREE_CARD_NAMES,
  UTH_RULES,
} from '@idlesuits/sim';

/** One rule the admin panel can change: a number or an on/off, found by its path in the rules object. */
export interface RuleKnob {
  path: string;
  label: string;
  /** The table it sits in ("Blind pays"), for grouping. */
  group: string;
  hint?: string;
  value: number | boolean;
  min?: number;
  max?: number;
}

interface GameRules {
  /** The rules as designed: every number and on/off in them can be tuned. */
  base: object;
  /** A pay table's key as a hand name ("4" → "Straight"); undefined for keys that aren't one. */
  name?: (key: string) => string | undefined;
  /** What a named value means, shown under it. Pay odds unless said otherwise. */
  unit?: string;
  /** Paths left out: ones the table's layout or strategy can't follow. */
  skip?: string[];
  /** Settings that aren't in the rules object but belong to this game. */
  extra?: RuleKnob[];
}

/** The decks-and-cut knob a shoe game adds, read by the table rather than the rules. */
export const PENETRATION: RuleKnob = {
  path: 'penetration',
  label: 'Cut card at',
  group: 'Shoe',
  hint: '% of the way in, ±5',
  value: 75,
  min: 20,
  max: 95,
};

const category = (key: string) => CATEGORY_NAMES[Number(key) as keyof typeof CATEGORY_NAMES];

export const GAME_RULES: Record<string, GameRules> = {
  blackjack: { base: FREE_BET_RULES, extra: [PENETRATION] },
  suits: {
    base: DEFAULT_RULES,
    skip: ['handSize', 'dealerClaimStake'],
    name: (k) => (/^\d+$/.test(k) ? `${k}-card flush` : undefined),
    unit: 'most it can raise, in antes',
  },
  uth: { base: UTH_RULES, name: category },
  stud: { base: STUD_RULES, name: category },
  tcp: { base: TCP_RULES, name: (k) => THREE_CARD_NAMES[k as keyof typeof THREE_CARD_NAMES] },
  paigow: { base: PAI_GOW_RULES },
  lir: { base: LIR_RULES, name: category },
  csp: { base: CSP_RULES, name: category },
  c4p: { base: C4P_RULES, name: (k) => (k in C4P_RULES.superBonus ? humanize(k) : undefined) },
  djwild: { base: DJ_RULES, name: (k) => DJ_CATEGORY_NAMES[Number(k) as keyof typeof DJ_CATEGORY_NAMES] },
};

/** Fields that hold a card rank, which reads better with a reminder. */
const RANK_FIELDS = new Set(['qualifyHigh', 'payPairFrom', 'pushPairFrom', 'opensHigh', 'minHighCard', 'noSplitValue']);

function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([a-z])([0-9])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every tunable rule of a game: its numbers and on/offs. Lists and functions are left alone. */
export function ruleKnobs(id: string): RuleKnob[] {
  const game = GAME_RULES[id];
  if (!game) return [];
  const out: RuleKnob[] = [];
  const walk = (obj: object, path: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      const at = [...path, key];
      if (game.skip?.includes(at.join('.'))) continue;
      if (typeof value === 'number' || typeof value === 'boolean') {
        const named = path.length > 0 ? game.name?.(key) : undefined;
        out.push({
          path: at.join('.'),
          label: named ?? humanize(key),
          // Grouped by where it sits: "Blind pays", "Raise caps · Values".
          group: path.map(humanize).join(' · ') || 'Rules',
          hint: RANK_FIELDS.has(key) ? 'card rank: 11 J · 12 Q · 13 K · 14 A' : named ? (game.unit ?? 'pays :1') : undefined,
          value,
        });
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, at);
      }
    }
  };
  walk(game.base, []);
  return [...out, ...(game.extra ?? [])];
}

/** A copy of `base` with values set along their paths, copying only the objects on the way. */
export function withOverrides<T extends object>(base: T, overrides: Readonly<Record<string, number | boolean>>): T {
  let out = base;
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split('.');
    const set = (obj: Record<string, unknown>, i: number): Record<string, unknown> => {
      const copy = Array.isArray(obj) ? ([...obj] as unknown as Record<string, unknown>) : { ...obj };
      copy[keys[i]!] = i === keys.length - 1 ? value : set((obj[keys[i]!] ?? {}) as Record<string, unknown>, i + 1);
      return copy;
    };
    out = set(out as Record<string, unknown>, 0) as T;
  }
  return out;
}
