# Idle Suits

An idle casino. Pick a table from the floor and the same bankroll follows you from game to game:

- **Idle Suits** — seven cards each, biggest flush wins, with side bets that pay on your hand alone.
- **Free Bet Blackjack** — the house pays for your doubles on 9/10/11 and every split but tens; in
  exchange a dealer 22 pushes. See
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
npm run balance -- --hands 1000000                    # Idle Suits odds
npm run balance -- --game blackjack --hands 1000000   # Free Bet Blackjack odds
```

The balance tool reproduces the published figures for both games: Idle Suits at a 2.64% house edge
under optimal play (7.53% on Flush Rush, 13.11% on Super Flush Rush), and Free Bet Blackjack at
1.04% — measured at 1.040% over eight million rounds, with its strategy solved from the rules rather
than hard-coded.

## Layout

| Path | What it is |
|---|---|
| `packages/sim` | The simulator: cards, hand evaluation, seeded shuffling, side bets, round resolution. No DOM, no timers, no `Math.random`. |
| `packages/balance` | Batch runner and CLI for simulating large numbers of hands. |
| `apps/game` | The Svelte 5 + Vite app: the lobby shell and the games themselves. |
| `apps/game/src/games/<id>` | One game: its rules, table, panels and pacing. Self-contained. |
| `apps/game/src/lib` | Shared across games: the casino wallet, money formatting, sound, the pausable clock, the game registry and routing. |
| `apps/game/src/components` | Shared UI: playing cards, payout breakdowns, the lobby. |

The simulator produces an event log; the UI only plays that log back. Any hand can be reproduced
exactly from its seed.

## Adding a game

Each game is a folder under `src/games/` and one entry in [`src/lib/games.ts`](apps/game/src/lib/games.ts).
Nothing else in the shell needs to know it exists.

1. Create `src/games/<id>/<Name>Game.svelte`. It takes one prop, `onExit`, and renders the whole
   screen: its own header, table and panels.
2. Add an entry to `GAMES` with the name, tagline, blurb and a `load` that imports that component.
   An entry without `load` shows on the floor as a closed table.
3. Draw money with `bankroll` from [`src/lib/casino.svelte.ts`](apps/game/src/lib/casino.svelte.ts),
   so every table shares one wallet.

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
