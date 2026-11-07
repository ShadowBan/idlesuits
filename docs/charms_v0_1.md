# Idle Suits — Tokens & Lucky Charms v0.1

A second layer to work toward: a collect-a-thon with upgrades attached that
pushes play forward over a long time and gives the casino a sense of
progression. Cash rises and falls with the cards; this layer only ever grows.

## The loop

1. **Win** at any table → earn **Tokens**, scaled by the odds of the win.
2. **Spend** Tokens at the **Charm Machine**, a capsule (gumball) machine.
3. Each capsule holds a **Lucky Charm**. A duplicate levels that charm up.
4. **Equip** up to five charms. They bend the payouts at every table.
5. Better charms win more Tokens and more cash → more pulls.

## Tokens

- Earned only. Never lost, never wagered.
- **Each winning bet earns its pay odds**: 1:1 earns 1, 3:2 earns 1.5,
  Pairplus 40:1 earns 40, a royal on the Trips bet earns 50. The stake does
  not matter, so the reward measures *how big the win was*, not the dollars,
  and stays meaningful however large the bankroll grows.
- Losses and pushes earn nothing, unless a charm says otherwise.
- Charms can raise the multiplier on earned Tokens and on long-shot wins.
- Per-game expected Tokens per hand is measurable with the odds audit; a
  per-game multiplier evens out any table that turns into the obvious farm.

## The Charm Machine

- One pull costs 50 Tokens; ten cost 450. New players get a starter roll of
  150 Tokens: three pulls to see the machine work.
- Rarity weights:

  | Rarity | Chance |
  |---|---|
  | Common | 62% |
  | Uncommon | 25% |
  | Rare | 9% |
  | Epic | 3.2% |
  | Legendary | 0.8% |

- Pulls are seeded (a per-save seed and the pull number), so they are
  reproducible like every hand in the casino.
- Later: **auto-pull**, the machine running constantly from Token income.
  No pity timer is planned; under auto-pull the volume does that job.

## Levels

- Level is `floor(log2(copies)) + 1`, to a maximum of **10**: 1, 2, 4, 8 …
  **512 copies** for a maxed charm. Each level needs as many copies again
  as everything before it.
- What that means at the weights above: maxing one common takes ~6,600
  pulls; maxing one legendary takes ~200,000. Good charms are rare and
  max-level charms are a long-term goal, even with the machine pulling
  constantly.
- Effects scale linearly from their level-1 value to their level-10 value.

## Slots

- Slot 1 is free. Slots 2–5 are bought with Tokens (500, 2,500, 10,000,
  50,000). Later: unlocked by milestones too, and **slot upgrades** (a slot
  that boosts whatever charm sits in it).
- One loadout for the whole casino now; **a loadout per game** later.

## Charm effects

Charms act on a **round report** every table sends when a hand settles:
each bet's stake and result, the main outcome (win, lose, push, fold), the
poker category of the final hand where there is one, and flags (blackjack,
a big flush). One charm works at every table without the table knowing it.

Two layers:

1. **Settlement effects** (built now): extra payouts on certain hands,
   refunds on misses, pushes paid, streak bonuses, comps on everything
   wagered, chances to shield a loss or double a win, Token multipliers.
2. **Rule-bending effects** (later, rare and legendary): an ace up the
   sleeve, a peek at the hole card. These live inside the seeded simulator,
   game by game.

Some charms work everywhere; some only where their condition can happen
(a Horseshoe needs a poker hand, a Lucky Ace needs blackjack). Every chance
effect is seeded from the round, so a hand replays exactly.

### Balance target

A strong loadout should **eventually** beat the house, **very slowly**.
House edges run 1–5% on main games and more on side bets. Level-1 effects
are worth tenths of a percent; a full loadout of maxed rare-and-better
charms is worth a few percent. Breaking even is a months-long goal. The
audit will learn to measure a loadout's edge before tuning.

## Sets

Charms of **Rare and above** belong to sets of three. With all three
equipped, the set's bonus applies, at the level of its lowest member — so
a set rewards collecting *and* levelling all three.

| Set | Members | Bonus |
|---|---|---|
| Luck of the Irish | Four-Leaf Clover, Pot of Gold, Golden Horseshoe | Every win pays a little more |
| Eastern Fortune | Maneki-neko, Golden Toad, Jade Dragon | Many more Tokens |
| Saints & Wards | Hamsa, Evil Eye, Saint Cajetan Medal | Losses shielded more often |
| One-Armed Bandit | Piggy Bank, Joker's Cap, Boomerang | The slot machine nudges the bonus in |

## Catalog (33, and two Secret)

Traditional gambling charms first; many more themes to come.

| Rarity | Charms |
|---|---|
| Common | Lucky Penny, Acorn, Fuzzy Dice, Wishbone, Lucky Socks, Horseshoe, Ladybug, Lucky Cricket, Magpie Feather |
| Uncommon | Silver Dollar, Fortune Cookie, Magic 8-Ball, Pair of Dice, Golden Ticket, Mojo Bag, Lucky Bamboo, Lever Knob |
| Rare | Four-Leaf Clover, Rabbit's Foot, Maneki-neko, I-Ching Coins, Lucky Ace, Lucky Elephant, Piggy Bank |
| Epic | Golden Toad, Hamsa, Evil Eye, Pot of Gold, Joker's Cap |
| Legendary | Saint Cajetan Medal, Golden Horseshoe, Jade Dragon, Boomerang |

Each has its own small illustration, drawn as SVG to one style: a thick dark
outline, flat colour, one highlight. They should read like keepsakes on a
shelf.

## Slot charms

Five charms work inside the slot machines, as the reels spin, rather than on
the settled hand. The slot engine takes their chances (`SlotCharms`, built
from the loadout by `slotCharms`) and rolls each on a stream of its own, so
a spin without them plays exactly as before.

| Charm | Rarity | What it does | Level 1 → 10 |
|---|---|---|---|
| Magpie Feather | Common | Tokens for every gem that drops into a pot | 0.5 → 3 Tokens a gem |
| Lever Knob | Uncommon | Tokens on a spin one short of the bonus; and a small chance a reel **nudges** a step to bring the bonus in | 0.5 → 3 Tokens; 0.15% → 0.8% |
| Piggy Bank | Rare | As the bonus starts, each pot that isn't full may **fill anyway** | 0.3% → 1.5% a pot |
| Joker's Cap | Epic | A spin may turn one of reels 2–4 **wild** | 0.15% → 0.7% a spin |
| Boomerang | Legendary | The bonus may **play again** once it ends | 0.8% → 3.5% a bonus |

The ones that change a spin are each worth a whole bonus or a wild reel when
they fire, so their chances are small: each adds about 0.1–0.3% to a
machine's payback at level 1 and about 0.6–1.5% at level 10. The slot edge
is about 6%, so a full loadout of maxed slot charms comes close to even.
The Token charms cost no payback and fire every few spins. The Piggy Bank's
worth is exact: the pot chain takes its chance of a top-up (`potChain(m, topUp)`).

## Saving

Everything saves in the browser: bankroll, Tokens, collection, loadout,
slots, each table's bets and speed, sound, card style. The save is
versioned so a backend can take it over later for multi-device play.

## Where the code lives

- `packages/sim/src/charms/` — pure and seeded: the catalog, sets, levels,
  the machine's draws, Token earning and every effect. Testable, and usable
  by the audit.
- `apps/game/src/lib/meta.svelte.ts` — the player's Tokens, collection and
  loadout, saved; `settleRound` is the one call every table makes when a
  hand ends.
- `apps/game/src/components/charms/` — the art, the machine, the collection.

## Later

Auto-pull; per-game loadouts; slot upgrades; collection milestones (an
album, rewards for completing a rarity or a theme); rule-bending charms;
seasonal capsules; a backend for multi-device saves.
