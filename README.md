# Idle Suits

An idle casino. Pick a table from the floor and the same bankroll follows you from game to game:

- **Idle Suits** — seven cards each, biggest flush wins, with side bets that pay on your hand alone.
- **Free Bet Blackjack** — the house pays for your doubles on 9/10/11 and every split but tens; in
  exchange a dealer 22 pushes. Dealt from a six-deck shoe down to a cut card, with insurance against
  a dealer ace. Side bets: Pot of Gold, Push 22.
- **Ultimate Texas Hold'em** — bet 4× before the flop, 2× on it, or 1× at the end, against a dealer
  who needs a pair to open. Side bets: Trips, 6-Card Bonus, Hole Card Bonus, Bad Beat.
- **Mississippi Stud** — no dealer; raise 1× or 3× as each community card lands, and every bet is
  paid off the same pay table. Side bet: 3-Card Bonus.
- **Three Card Poker** — three cards each; play or fold, with an Ante bonus for straights and better.
  Side bets: Pairplus, 6-Card Bonus, Prime.
- **Pai Gow Poker** — seven cards from a 53-card deck with a joker, set into a five-card and a
  two-card hand; win both to get paid. Side bets: Fortune, Emperor's Challenge, Pai Gow Insurance.
- **Let It Ride** — three bets on your three cards plus two shared; pull back up to two of them as
  the cards come. Side bets: 3-Card Bonus, 5-Card Bonus.
- **Caribbean Stud** — five cards against the dealer's five, one showing; raise 2× and a big hand
  pays the raise up to 100:1. Side bet: 5+1 Bonus.
- **Crazy 4 Poker** — best four of five; play up to 3× with aces, and the Super Bonus pays any
  straight or better. Side bet: Queens Up.
- **Baccarat** — Punto Banco from an eight-deck shoe: back the Player or the Banker, and the hand closest
  to nine wins by the fixed drawing rules. Banker pays less 5% commission. Side bets: Tie, Player
  Pair, Banker Pair. You turn the cards of the hand you backed, as the biggest bettor on each side
  does at a real table (auto play turns them for you). A bead-plate scoreboard keeps the shoe's coups.
- **DJ Wild** — five cards from 53 with deuces and the joker wild; play 2× or fold, and a winning
  straight or better pays the Blind. Side bets: Trips, which pays more for natural hands, and the
  Two-Way Bad Beat.

And on the **slot floor**, original machines on one shared slot engine:

- **Midnight Vault** — five reels of three rows, 243 ways, wilds on reels 2–4. Six gold coins start
  hold & spin: the coins stick, each new one resets three respins, and every coin pays its cash or a
  Mini, Minor or Major jackpot. A full screen pays the Grand on top. Three pots over the reels fill
  from gems on the coins and keep their progress from spin to spin: every full pot joins the next
  hold & spin (Boost grows every coin each respin, Extra gives four respins, the Collector pays the
  cash twice), and all three at once is the Super hold & spin.
- **Lucky Forge** — upgrading symbols. Three anvils start 10 free spins on reels heavy with
  horseshoes. Every three hammers strike the forge: every horseshoe moves up a tier (bronze, silver,
  gold, crown) and two spins are added. A screen of nothing but crowns and wilds pays the Grand.
  Embers on the anvils fill three pots: the Golden Anvil makes wilds 2×, the Coal Cart adds three
  spins, the Bellows starts the forge a tier up.
- **Pirate's Haul** — a collector. Doubloons carry cash or a jackpot, and a captain on reel 5 takes
  every one on the screen. Three maps start 10 free spins with captains on reels 2–5; every fifth
  captain adds 10 spins and raises the cash multiplier to 2×, 3× and then 10×. Gems on the maps fill
  three pots: the Jolly Roger starts the captains at 2×, the Powder Keg adds three spins, Loaded
  Cannons double every doubloon's cash.
- **Carnival Crown** — a wheel of wheels. A ticket on reels 2, 3 and 4 spins the outer wheel for cash
  or the Mini; Up climbs to the middle wheel (bigger cash, the Minor) and then the crown wheel (the
  Major, the Grand, up to 500×). Gems on the tickets fill three pots: Lucky Ups turns two outer
  wedges to Up, the Ringmaster spins a ×1–×5 ring on the cash, the Encore plays the wheel twice.
- **Paper Lanterns** — pick to match. Three lanterns open a board of twelve, three of each jackpot;
  pick until one shows three times. The jackpot is drawn by weight first and the picks laid out to
  match, as a real machine does it. Gems on the lanterns fill three pots: the Dragon plays a second
  board, the Moon clears the Mini off the board, the Phoenix raises the jackpot a tier.

Every machine's pots are a ladder: the first fills about every other bonus, the second about one in
five, the third one in fifteen or so, and all three together, the Super, a few times in a hundred.

And the **instant games**, the quick press-your-luck games online casinos run beside their slots
(`packages/sim/src/instant`), each paying back exactly what the pit boss sets (97% to start):

- **Dynamite Dig** — Mines. Bury 1–24 sticks of dynamite in 25 squares and dig. Gems raise the
  cash-out, stars twice as much, and a mine cart takes a ride through four junctions (pick a tunnel;
  one has caved in) for a multiplier; dynamite loses the bet. Every find also drops a share of the bet
  in the Gem Vault, kept in dollars from round to round; 40 finds open its bonus board, which pays the
  vault back on average. Each dig is priced so the cash-out after it, plus what it drops in the vault,
  is worth on average what the cash-out is now, with the house's cut taken once up front: the payback
  is the same however the player digs. With no stars, cart or vault it's the real game's rtp ÷ the
  chance of surviving.
- **Deep Drop** — Crash, on a fishing line. The multiplier climbs as the hook sinks until the line
  snaps; reel in first, by hand or at a marker you can type. One line in 30 drops golden and pays
  double. The snap point is drawn so the line lasts to x with chance r ÷ x, with r the payback less
  the golden lines' share, so every reel-in pays back the same.
- **Lucky Drop** — Plinko. Balls fall through 8, 12 or 16 rows of pegs, left or right as likely as not,
  into slots paying most at the edges and less than the ball in the middle. Each slot's chance is
  binomial, so a board's payback is an exact sum. One ball in 150 drops golden and sets off Fever:
  six free balls, every slot paying double. Nine boards of our own, drawn so each pays within a sixth
  of a percent of 97% with Fever, and scaled alike by the pit boss.

See
[docs/idle_suits_game_concept_v0_2.md](docs/idle_suits_game_concept_v0_2.md) for the design concept and
[docs/decisions_v0_3.md](docs/decisions_v0_3.md) for the rules and decisions the build follows.

## Getting started

```bash
npm install
npm run dev        # play at http://localhost:5173
```

Other commands:

```bash
npm test           # simulator, director, and verdict tests
npm run typecheck  # TypeScript + svelte-check
npm run build      # production build into apps/game/dist
npm run audit      # check every game and side bet against published odds (~5 min, all cores)
npm run audit -- --quick --out docs/odds_audit.md     # a tenth of the rounds, and write the report
npm run balance -- --hands 1000000                    # Idle Suits odds
npm run balance -- --game blackjack --hands 1000000   # Free Bet Blackjack odds
npm run balance -- --game uth --hands 12000000 --workers 15    # Ultimate Texas Hold'em
npm run balance -- --game stud --hands 60000000 --workers 15   # Mississippi Stud
npm run derive:uth-chart                              # re-derive the UTH pre-flop chart
```

`--workers` splits a run across processes. The two poker games need it: a round of Ultimate swings
about 4 antes and a round of Mississippi Stud about 9, so their house edges only settle down after
tens of millions of rounds.

### Odds audit

`npm run audit` holds every game and every side bet to its published house edge, and writes
[docs/odds_audit.md](docs/odds_audit.md). Pay tables that can be dealt out completely are checked
**exactly**, through the simulator's own evaluators: every one of the 133,784,560 seven-card hands
for Trips and the flush bets, every six-card hand for the 6-Card Bonus, all 155,937,600 deals of
Mississippi Stud, all 407,170,400 of Three Card Poker and all 51,979,200 of Let It Ride played by the
table's strategy, and all 154,143,080 seven-card Pai Gow hands, joker included. Everything else is simulated through the real round
engines with a 95% margin, and so is every exact bet, to prove the table settles it the same way.

| Bet | Measured | Published | How |
|---|---|---|---|
| Idle Suits | 2.75% ±0.11% | 2.64% | 8M rounds |
| Flush Rush | 7.53% | 7.53% | exact |
| Super Flush Rush | 13.09% | 13.11% | exact (see below) |
| Free Bet Blackjack | 1.064% ±0.033% | 1.04% | 40M rounds |
| Pot of Gold | 8.74% ±0.12% | 5.77% | 40M rounds (see below) |
| Push 22 | 11.77% ±0.10% | 11.76% | 40M rounds |
| Ultimate Texas Hold'em | 2.41% ±0.34% per ante | 2.43% (this strategy) | 8M rounds |
| Trips | 0.902% | 0.902% | exact |
| 6-Card Bonus | 8.56% | 8.56% | exact |
| Hole Card Bonus | 8.54% | 8.54% | exact |
| Bad Beat | 15.2% ±1.0% | 14.79% | 8M rounds |
| Mississippi Stud | 4.9149% per ante | 4.9149% | exact |
| 3-Card Bonus | 2.14% | 2.14% (NJ pay table 4) | exact |
| Three Card Poker | 3.373% per ante | 3.373% | exact |
| Pairplus | 2.32% | 2.32% | exact |
| 6-Card Bonus | 8.56% | 8.56% | exact |
| Prime | 3.62% | 3.62% | exact |
| Pai Gow Poker | 2.73% ±0.04% | 2.72% (house way) | 16M rounds |
| Fortune | 7.77% | 7.77% | exact |
| Emperor's Challenge | 4.17% | 4.17% | exact |
| Pai Gow Insurance | 7.35% | 7.35% | exact |
| Let It Ride | 3.506% per bet | 3.506% | exact |
| 3-Card Bonus (Let It Ride) | 7.10% | 7.10% | exact |
| 5-Card Bonus | 23.73% | 23.73% | exact |
| Caribbean Stud | 5.21% ±0.07% per ante | 5.22% (Wizard's strategy) | 40M rounds |
| 5+1 Bonus | 8.56% | 8.56% | exact |
| Crazy 4 Poker | 3.44% ±0.10% per ante | 3.42% | 40M rounds |
| Queens Up | 6.78% | 6.78% | exact |
| DJ Wild | 3.43% ±0.11% per ante | 3.47% | 40M rounds |
| Trips (DJ Wild) | 6.16% | 6.16% | exact |
| Two-Way Bad Beat | 13.9% ±0.2% | none published | 64M rounds |
| Baccarat: Banker | 1.0579% | 1.0579% (8 decks) | exact (test) |
| Baccarat: Player | 1.2351% | 1.2351% | exact (test) |
| Tie (8:1) | 14.36% | 14.36% | exact (test) |
| Player / Banker Pair (11:1) | 10.36% | 10.36% | exact (test) |

Baccarat's rows are checked in `packages/sim/test/baccarat.test.ts`, which walks every way the cards
can fall from an eight-deck shoe and holds the round engine's winners to those odds; it isn't in
`npm run audit` yet.

Two differ from their source, for known reasons. Wizard of Odds' Super Flush Rush table counts 124
fewer straight flushes than the progressive table on the same page; the simulator matches the
progressive table. Its Pot of Gold figure comes from a simulation that earns a free bet in 16.66% of
rounds, but under today's rules that chance is exactly 16.18%, which puts the bet at 8.74%. The game
shows the measured edge beside every side bet.

## Layout

| Path | What it is |
|---|---|
| `packages/sim` | The simulator: cards, hand evaluation, seeded shuffling, side bets, round resolution. No DOM, no timers, no `Math.random`. |
| `packages/balance` | Batch runner and CLI for simulating large numbers of hands. |
| `apps/game` | The Svelte 5 + Vite app: the lobby shell and the games themselves. |
| `apps/game/src/games/<id>` | One game: its rules, table, panels and pacing. Self-contained. |
| `apps/game/src/lib` | Shared across games: the casino wallet, money formatting, sound, the pausable clock, the game registry and routing. |
| `apps/game/src/components` | Shared UI: the table shell and printed felt, chips, the chip rack and bet spots, card rows, playing cards, decision and bet bars, result banners, pay tables, payout breakdowns, the rules frame, the lobby. |

The simulator produces an event log; the UI only plays that log back. Any hand can be reproduced
exactly from its seed.

Each game is dealt the way a casino deals it, and its entry in `GAMES` records how many decks: the
carnival games use one deck reshuffled every hand (Pai Gow and DJ Wild add a joker), and Blackjack
deals a six-deck shoe. The shoe (`shuffleShoe` in `packages/sim/src/shoe.ts`) is shuffled once,
burns a card and deals down to a cut card 70–80% of the way in; the table keeps it between rounds and
saves it. The odds audit still deals Blackjack from a fresh shoe every round, as the published edges
assume.

## The slot floor

A machine is data (`MachineDef` in `packages/sim/src/slots/types.ts`): reel strips, symbols and
their pays, its bonus (`bonus.kind`: `holdSpin`, `upgrade`, `collect`, `wheel` or `pick`) and the
jackpots it awards. `spinSlot` plays one seeded spin, bonus and all, so any spin replays exactly.
Coin stacks, scatters and runs of metal are laid into the strips by design (`buildStripBlocks`), so
how often a bonus lands is a dial rather than an accident of the shuffle.

The payback is exact, not simulated (`slotPayback` in `rtp.ts`). The reels stop independently, so
the expected way-pays factor reel by reel, and a scatter or coin count is a convolution of each
reel's own counts. Hold & spin is a small Markov chain on coins held and respins left. Free spins
are a chain on spins left and the meter: it gives the expected spins played at each level, and each
spin's pay is linear, so the forge's upgraded ways and the captains' multiplied collects follow from
that (a collect pays every collector times every coin, so it needs only E[collectors × coins]). The
forge's Grand pays once a bonus, so it's the chain's chance of at least one full screen. The wheel
and the pick are plain sums. The pots really carry from spin to spin, so their worth is a chain on
the pots' fill (`potChain` in `pots.ts`): between bonuses the pots only fill, so one pass in order of
fill gives the spins spent at each, and the bonus spin empties the full ones; repeating that bonus
to bonus settles on how often each mix of pots (and, for hold & spin, each count of coins) starts
it. Gems ride on whatever starts the bonus: coins on the vault, the scatter elsewhere. Each mix's
powers then feed the bonus's own sums: a start further along the free-spin chain, a stretched meter
step, wilds weighted in the ways (still independent reel by reel), a ring's mean on the wheel's
cash, a jackpot's weight moved up a tier.

| Machine | Designed | Bonus |
| --- | --- | --- |
| Midnight Vault | 93.1% | 1 in 144 spins (a Super in 1 in 10 bonuses) |
| Lucky Forge | 94.2% | 1 in 146 (a Super in 1 in 41) |
| Pirate's Haul | 93.7% | 1 in 148 (a Super in 1 in 32) |
| Carnival Crown | 93.5% | 1 in 139 (a Super in 1 in 35) |
| Paper Lanterns | 94.1% | 1 in 130 (a Super in 1 in 77) |

The pit boss sets the payback (94% to start) and the way-pays, base game and free spins alike, scale
to hit it; everything else stays as designed. The payback is linear in that scale, so it's solved
exactly. `packages/sim/test/slots.test.ts` holds simulated spins, features, levels and picks to the
exact figures.

The Major and Grand are linked progressives across every machine (`lib/jackpot.svelte.ts`). They're
counted in bets, so they pay the same share in every room. Every hand anywhere in the casino, table
or machine, adds to them, and so does the rest of the link, a little every second the casino is open;
whoever hits one starts it over. The Major is also a must-hit-by jackpot: it pays on the first spin
after it passes a hidden point between its seed (250×) and its cap (375×), so it always pays before
the cap, and coins can still hit it sooner. As the meters grow, the machines pay back more than their
designed figure.

## Rooms and table limits

Every table plays at the limits of the room the player is sitting in, picked in the lobby: the Main
Floor's $5–$500 tables, then the Mezzanine ($25), High Limit ($100), Salon Privé ($500) and up the
chip ladder without end. The maximum is a hundred minimums, side bets go to a fifth of that, and a
room opens for good once the bankroll first holds fifty of its minimum bets. Higher rooms multiply
the Tokens earned there (+10% a room). Short of a room's minimum, a table moves the player down to
a room they can cover; below the Main Floor's $5 they're busted and buy back in on the Main Floor.

The ladder is pure, in `lib/rooms.ts`; `lib/floor.svelte.ts` holds the current room and the highest
opened. `ChipBets` enforces the limits, so a table gets them for free.

## Tokens and lucky charms

Winning at any table earns **Tokens**: each winning bet earns its pay odds, whatever its stake.
Tokens are never lost; they're spent at the **Charm Machine** (`#/charms`), a capsule machine of
collectible lucky charms. Duplicates level a charm up, up to five are equipped at once, and
Rare-or-better charms form sets. The design is in [docs/charms_v0_1.md](docs/charms_v0_1.md).

The catalog, levels, the machine's draws and every effect are pure and seeded, in
`packages/sim/src/charms/`. Each table reports a settled hand to `meta.settleRound`
(`apps/game/src/lib/meta.svelte.ts`) with a `RoundReport`: each bet's stake and result, the
outcome and the hand made. That one call applies the charms and pays the bankroll and the Tokens.

**Secret** charms change the game itself and are drawn apart from the rarities, each at its own
odds (`SECRET_ODDS` in `machine.ts`, 0.001% each to start), topping out after two or three levels:

- **The Lucky Seat** deals one or two extra hands blind at the poker tables. A round can be told its
  seat (`seat` on every poker round, `seated` in `packages/sim/src/seats.ts`): each seat's cards come
  off the deck in turn and the dealer and board are shared after them, so the extra hands sit in the
  seats dealt before the player's and change the cards the player gets. They're face down until the
  dealer shows and play all in (`BLIND` in `blind.ts`): never fold, always the biggest raise. Each
  settles through the charms as a hand of its own. Between hands the player sets how each extra
  seat bets, in the sidebar's Extra hands panel: the same as their own hand, a main bet and side bets
  of its own, or sitting out. `BlindHands` (`lib/blind.svelte.ts`), `BlindBetsPanel` and
  `BlindSeats` carry this for a table.
- **The Thin Shoe** takes decks out of the Blackjack shoe at its next shuffle.

Everything is saved in the browser (`lib/save.ts`): the bankroll, the room, Tokens, charms, each
table's bets and speed, sound and card style.

## Adding a game

Each game is a folder under `src/games/` and one entry in [`src/lib/games.ts`](apps/game/src/lib/games.ts).
Nothing else in the shell needs to know it exists.

1. Create `src/games/<id>/<Name>Table.svelte`. It takes one prop, `onExit`, and renders the whole
   screen. [`TableShell`](apps/game/src/components/TableShell.svelte) gives you the responsive
   header, felt, action bar and side panels (a bottom sheet on phones); you fill in the snippets.
   A `Sequencer` from `lib/sequencer.svelte.ts` handles pacing, pausing and waiting on the player,
   and `stepWithChoices` from the simulator lets a round pause mid-hand for a decision.
   Any converted table (Three Card Poker is a short one) shows the pattern for the felt: a layout
   grid with the hands, a `FeltBand` (the printed name and the result banner) and a row of
   `BetSpot`s; `BetBar` or `DecisionBar` below; `SeatOverlay` and `TablePanels` for the rest. `TablePanels` is
   the sidebar: charms, Automation (auto play and speed, plus an `automation` snippet for anything
   auto play follows), then Pays, Stats and Table tabs; the game's pay tables and side bets go in as
   its children. Settings for the whole casino (sound, card faces) live in `SettingsDialog`, not here.
   Keep everything that changes during a hand in fixed-size boxes, so nothing on the felt moves
   when a card turns or a label appears.
2. Add an entry to `GAMES` with the name, tagline, blurb and a `load` that imports that component.
   An entry without `load` shows on the floor as a closed table.
3. Draw money with `bankroll` from [`src/lib/casino.svelte.ts`](apps/game/src/lib/casino.svelte.ts),
   so every table shares one wallet.
4. For side bets, define each as a `BonusBet` in the simulator (a pay table, its published edge and
   a `resolve` from the dealt cards) and settle them with `settleBonuses`. On the table,
   `SideStakes` holds the stakes and [`SideBetsPanel`](apps/game/src/components/SideBetsPanel.svelte)
   shows the pay tables. Then add the bet to `npm run audit`.
5. Bets are chips on the felt. `ChipBets` (in `lib/stakes.svelte.ts`) holds the next hand's main bet
   and side bets and keeps them within the bankroll; `spotView` tells each `BetSpot` what to show
   between hands and once the hand settles. Deal only when `bets.canDeal`.
6. When a hand settles, build a `RoundReport` (`lib/report.ts` has helpers) and call
   `meta.settleRound` instead of paying the bankroll directly, so charms and Tokens work at the
   new table. Call `bets.remember(id)` and `seq.remember(id)` so its bets and speed are saved.

Games are loaded only when opened, so an unplayed table costs nothing at startup. The route is
`#/<id>`, which makes tables deep-linkable and keeps the browser's back button working.

## Deploying to GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes on every push to
`main`. To set it up:

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow typechecks, tests, builds and deploys.

The site lands at `https://<user>.github.io/<repo>/`. The workflow passes the repository name to the
build as `BASE_PATH` so assets resolve under that subpath; a repository named `<user>.github.io` is
built for the domain root instead. To build for a subpath locally:

```bash
BASE_PATH=/idlesuits/ npm run build
```

The game is entirely client-side with no backend; progress is saved in the browser it's played in.
