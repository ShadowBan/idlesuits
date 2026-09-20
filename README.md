# Idle Suits

An idle deckbuilding card game built on high-card-flush casino rules. Each hand deals seven cards to
you and the dealer from a shared shoe; the biggest flush wins. See
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
npm run balance -- --hands 1000000   # simulate hands and print the odds
```

The balance tool reproduces the published figures for the casino game it is based on: a 2.64% house
edge under optimal play, 7.53% on Flush Rush and 13.11% on Super Flush Rush.

## Layout

| Path | What it is |
|---|---|
| `packages/sim` | The simulator: cards, hand evaluation, seeded shuffling, side bets, round resolution. No DOM, no timers, no `Math.random`. |
| `packages/balance` | Batch runner and CLI for simulating large numbers of hands. |
| `apps/game` | The Svelte 5 + Vite game: table, reveal pacing, bets, sound. |

The simulator produces an event log; the UI only plays that log back. Any hand can be reproduced
exactly from its seed.

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
