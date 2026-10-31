import { Category } from '../poker';
import type { CharmDef, CharmSet } from './types';

const s = (min: number, max: number) => ({ min, max });

/**
 * The charms in the machine. Values are tuned so level-1 charms are worth
 * tenths of a percent and a maxed loadout of rare-and-better charms is worth
 * a few percent: enough to beat the house, eventually, very slowly.
 */
export const CHARMS: readonly CharmDef[] = [
  // Common
  {
    id: 'lucky-penny',
    name: 'Lucky Penny',
    rarity: 'common',
    flavor: 'Find a penny, pick it up, and all day long you’ll have good luck.',
    effects: [{ kind: 'sideRefund', v: s(0.01, 0.05) }],
  },
  {
    id: 'acorn',
    name: 'Acorn',
    rarity: 'common',
    flavor: 'Mighty oaks from little acorns grow — slowly.',
    effects: [{ kind: 'tokenPerHand', v: s(0.05, 0.3) }],
  },
  {
    id: 'fuzzy-dice',
    name: 'Fuzzy Dice',
    rarity: 'common',
    flavor: 'Hung from the mirror of every lucky ride.',
    effects: [{ kind: 'tokenPct', v: s(0.05, 0.3) }],
  },
  {
    id: 'wishbone',
    name: 'Wishbone',
    rarity: 'common',
    flavor: 'The long half always gets the wish.',
    effects: [{ kind: 'comeback', v: s(0.01, 0.04) }],
  },
  {
    id: 'lucky-socks',
    name: 'Lucky Socks',
    rarity: 'common',
    flavor: 'Never washed during a hot streak.',
    effects: [{ kind: 'pushPay', v: s(0.03, 0.12) }],
  },
  {
    id: 'horseshoe',
    name: 'Horseshoe',
    rarity: 'common',
    flavor: 'Hang it points up, or the luck runs out.',
    effects: [{ kind: 'tierBonus', minTier: Category.Trips, v: s(0.006, 0.03) }],
    where: 'Poker games',
  },
  {
    id: 'ladybug',
    name: 'Ladybug',
    rarity: 'common',
    flavor: 'Count her spots: that’s how many lucky months.',
    effects: [{ kind: 'longshotTokens', minOdds: 3, v: s(0.1, 0.6) }],
  },
  {
    id: 'lucky-cricket',
    name: 'Lucky Cricket',
    rarity: 'common',
    flavor: 'Kept in a little cage by the door; it sings when luck is near.',
    effects: [{ kind: 'tokenOnLoss', v: s(0.05, 0.25) }],
  },

  // Uncommon
  {
    id: 'silver-dollar',
    name: 'Silver Dollar',
    rarity: 'uncommon',
    flavor: 'Never spend your first one.',
    effects: [{ kind: 'comp', v: s(0.001, 0.006) }],
  },
  {
    id: 'fortune-cookie',
    name: 'Fortune Cookie',
    rarity: 'uncommon',
    flavor: 'Your lucky numbers are 7, 11 and 21.',
    effects: [{ kind: 'tokenDouble', v: s(0.04, 0.2) }],
  },
  {
    id: 'magic-8-ball',
    name: 'Magic 8-Ball',
    rarity: 'uncommon',
    flavor: 'Signs point to yes.',
    effects: [{ kind: 'lossShield', refund: 0.25, v: s(0.04, 0.12) }],
  },
  {
    id: 'pair-of-dice',
    name: 'Pair of Dice',
    rarity: 'uncommon',
    flavor: 'Snake eyes on one side, boxcars on the other.',
    effects: [{ kind: 'tierBonus', minTier: Category.Pair, v: s(0.002, 0.01) }],
    where: 'Poker games',
  },
  {
    id: 'golden-ticket',
    name: 'Golden Ticket',
    rarity: 'uncommon',
    flavor: 'Admit one to the big win.',
    effects: [{ kind: 'longshotTokens', minOdds: 10, v: s(0.25, 1.5) }],
  },
  {
    id: 'mojo-bag',
    name: 'Mojo Bag',
    rarity: 'uncommon',
    flavor: 'A little flannel pouch of roots, coins and secrets.',
    effects: [
      { kind: 'tokenPct', v: s(0.03, 0.15) },
      { kind: 'comp', v: s(0.0005, 0.002) },
    ],
  },
  {
    id: 'lucky-bamboo',
    name: 'Lucky Bamboo',
    rarity: 'uncommon',
    flavor: 'Three stalks for happiness, wealth and a long life.',
    effects: [{ kind: 'tokenPerHand', v: s(0.15, 0.8) }],
  },

  // Rare
  {
    id: 'four-leaf-clover',
    name: 'Four-Leaf Clover',
    rarity: 'rare',
    flavor: 'One in ten thousand clovers has the fourth leaf.',
    effects: [{ kind: 'flushBonus', v: s(0.06, 0.3) }],
    where: 'Poker games and Idle Suits',
  },
  {
    id: 'rabbits-foot',
    name: 'Rabbit’s Foot',
    rarity: 'rare',
    flavor: 'Lucky for you. Less so for the rabbit.',
    effects: [{ kind: 'lossShield', refund: 0.5, v: s(0.04, 0.12) }],
  },
  {
    id: 'maneki-neko',
    name: 'Maneki-neko',
    rarity: 'rare',
    flavor: 'The beckoning cat waves good fortune through the door.',
    effects: [{ kind: 'streak', v: s(0.006, 0.03) }],
  },
  {
    id: 'iching-coins',
    name: 'I-Ching Coins',
    rarity: 'rare',
    flavor: 'Three old coins on a red string, square holes and all.',
    effects: [{ kind: 'bigHit', minOdds: 10, v: s(0.02, 0.1) }],
  },
  {
    id: 'lucky-ace',
    name: 'Lucky Ace',
    rarity: 'rare',
    flavor: 'Kept in the hatband of every old-time card sharp.',
    effects: [{ kind: 'blackjackBonus', v: s(0.05, 0.25) }],
    where: 'Blackjack',
  },
  {
    id: 'lucky-elephant',
    name: 'Lucky Elephant',
    rarity: 'rare',
    flavor: 'Trunk up, to catch the luck as it falls.',
    effects: [{ kind: 'comeback', v: s(0.03, 0.1) }],
  },

  // Epic
  {
    id: 'golden-toad',
    name: 'Golden Toad',
    rarity: 'epic',
    flavor: 'The money frog sits on its coins, a coin in its mouth.',
    effects: [
      { kind: 'tokenOnLoss', v: s(0.3, 1.5) },
      { kind: 'tokenPct', v: s(0.1, 0.3) },
    ],
  },
  {
    id: 'hamsa',
    name: 'Hamsa',
    rarity: 'epic',
    flavor: 'The open hand turns bad luck away.',
    effects: [{ kind: 'lossShield', refund: 1, v: s(0.02, 0.06) }],
  },
  {
    id: 'evil-eye',
    name: 'Evil Eye',
    rarity: 'epic',
    flavor: 'The blue glass eye stares down a cold streak.',
    effects: [{ kind: 'losingStreakShield', v: s(0.5, 1) }],
  },
  {
    id: 'pot-of-gold',
    name: 'Pot of Gold',
    rarity: 'epic',
    flavor: 'Found at the end of the rainbow, if you can get there.',
    effects: [
      { kind: 'bigHit', minOdds: 25, v: s(0.05, 0.25) },
      { kind: 'longshotTokens', minOdds: 25, v: s(0.5, 2) },
    ],
  },

  // Legendary
  {
    id: 'st-cajetan',
    name: 'Saint Cajetan Medal',
    rarity: 'legendary',
    flavor: 'The patron saint of gamblers, worn close to the heart.',
    effects: [{ kind: 'doubleWin', v: s(0.005, 0.025) }],
  },
  {
    id: 'golden-horseshoe',
    name: 'Golden Horseshoe',
    rarity: 'legendary',
    flavor: 'Cast in gold, nails and all, from the shoe of a Derby winner.',
    effects: [{ kind: 'bigHit', minOdds: 0, v: s(0.005, 0.03) }],
  },
  {
    id: 'jade-dragon',
    name: 'Jade Dragon',
    rarity: 'legendary',
    flavor: 'Carved from one stone; the pearl in its claw is wealth.',
    effects: [
      { kind: 'tokenPct', v: s(0.5, 2) },
      { kind: 'tokenPerHand', v: s(0.2, 1) },
    ],
  },
];

export const CHARM_SETS: readonly CharmSet[] = [
  {
    id: 'irish',
    name: 'Luck of the Irish',
    members: ['four-leaf-clover', 'pot-of-gold', 'golden-horseshoe'],
    bonus: [{ kind: 'bigHit', minOdds: 0, v: s(0.01, 0.04) }],
    blurb: 'Every win pays a little more.',
  },
  {
    id: 'eastern',
    name: 'Eastern Fortune',
    members: ['maneki-neko', 'golden-toad', 'jade-dragon'],
    bonus: [{ kind: 'tokenPct', v: s(0.5, 2) }],
    blurb: 'Tokens pour in.',
  },
  {
    id: 'wards',
    name: 'Saints & Wards',
    members: ['hamsa', 'evil-eye', 'st-cajetan'],
    bonus: [{ kind: 'lossShield', refund: 1, v: s(0.03, 0.1) }],
    blurb: 'Losses are turned away more often.',
  },
];

const BY_ID = new Map(CHARMS.map((c) => [c.id, c]));

export function findCharm(id: string): CharmDef | undefined {
  return BY_ID.get(id);
}

export function setOf(id: string): CharmSet | undefined {
  return CHARM_SETS.find((set) => set.members.includes(id));
}
