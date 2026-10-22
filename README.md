# Idle Suits

An idle casino. Pick a table from the floor and the same bankroll follows you from game to game:

- **Idle Suits** — seven cards each, biggest flush wins, with side bets that pay on your hand alone.
- **Free Bet Blackjack** — the house pays for your doubles on 9/10/11 and every split but tens; in
  exchange a dealer 22 pushes. Side bets: Pot of Gold, Push 22.
- **Ultimate Texas Hold'em** — bet 4× before the flop, 2× on it, or 1× at the end, against a dealer
  who needs a pair to open. Side bets: Trips, 6-Card Bonus, Hole Card Bonus, Bad Beat.
- **Mississippi Stud** — no dealer; raise 1× or 3× as each community card lands, and every bet is
  paid off the same pay table. Side bet: 3-Card Bonus.

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
for Trips and the flush bets, every six-card hand for the 6-Card Bonus, and all 155,937,600 deals of
Mississippi Stud played by the table's strategy. Everything else is simulated through the real round
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
| `apps/game/src/components` | Shared UI: the table shell, card rows, playing cards, pay tables, payout breakdowns, the rules frame, the lobby. |

The simulator produces an event log; the UI only plays that log back. Any hand can be reproduced
exactly from its seed.

## Adding a game

Each game is a folder under `src/games/` and one entry in [`src/lib/games.ts`](apps/game/src/lib/games.ts).
Nothing else in the shell needs to know it exists.

1. Create `src/games/<id>/<Name>Table.svelte`. It takes one prop, `onExit`, and renders the whole
   screen. [`TableShell`](apps/game/src/components/TableShell.svelte) gives you the responsive
   header, felt, action bar and side panels (a bottom sheet on phones); you fill in the snippets.
   A `Sequencer` from `lib/sequencer.svelte.ts` handles pacing, pausing and waiting on the player,
   and `stepWithChoices` from the simulator lets a round pause mid-hand for a decision.
2. Add an entry to `GAMES` with the name, tagline, blurb and a `load` that imports that component.
   An entry without `load` shows on the floor as a closed table.
3. Draw money with `bankroll` from [`src/lib/casino.svelte.ts`](apps/game/src/lib/casino.svelte.ts),
   so every table shares one wallet.
4. For side bets, define each as a `BonusBet` in the simulator (a pay table, its published edge and
   a `resolve` from the dealt cards) and settle them with `settleBonuses`. On the table,
   `SideStakes` and [`SideBetsPanel`](apps/game/src/components/SideBetsPanel.svelte) give you the
   stake controls and pay tables. Then add the bet to `npm run audit`.

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

The game is entirely client-side with no backend, and saves nothing yet, so each page load starts a
fresh session.
