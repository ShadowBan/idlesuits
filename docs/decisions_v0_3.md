# Idle Suits — Decisions v0.3

Decisions made after reviewing the v0.2 concept. Where this conflicts with v0.2, this wins.

## Base Rules (from I Luv Suits / High Card Flush)

- Fresh shuffle of the full shoe every hand.
- Each side receives 7 cards.
- Hand rank: largest suit count, then the flush's cards compared high to low. Exact tie = push.
- After seeing their hand the player folds or raises:

  | Flush size | Max raise |
  |------------|-----------|
  | 2–4        | 1× Ante   |
  | 5          | 2× Ante   |
  | 6–7        | 3× Ante   |
  | 8+         | +1× per extra card (extrapolated) |

- Dealer qualifies with a 3-card flush, 9-high or better. The qualifier is a table rule so cards and modifiers can change it.
  - Dealer does not qualify: Ante pays 1:1, raise pushes.
  - Dealer qualifies: higher hand wins Ante and raise 1:1; tie pushes both.
- Folding loses the Ante. Side bets resolve regardless of folding.

Reference: optimal play (raise max with any 4+ flush and 3-card flushes about 10-8-6 or better) gives a 2.64% house edge, a 32.1% fold rate and an average wager of 1.711 antes. (J-9-6, sometimes quoted, is too tight: it gives -3.6%.) The simulator must reproduce this on a standard deck.

## Side Bets

| Flush Rush (flush size) | Pays | Super Flush Rush (straight flush length) | Pays |
|---|---|---|---|
| 4 | 1:1 | 3 | 7:1 |
| 5 | 10:1 | 4 | 60:1 |
| 6 | 100:1 | 5 | 100:1 |
| 7 | 300:1 | 6 | 1,000:1 |
| | | 7 | 8,000:1 |

Reference house edges: Flush Rush 7.53%, Super Flush Rush 13.11%.

Pay tables beyond 7 cards extrapolate at ×10 per extra card, so any size has a predictable payout.

## Side-Bet Ownership

- An unclaimed side bet is **neutral** by default: nobody owns it.
- Dealer ownership of unclaimed bets is a **dealer downside**, introduced by specific dealers or dealer cards, not an always-present threat.
- Whether a side bet is worth taking should come mostly from card design: some decks feed side bets, others make them a liability.
- Dealer-owned bet: if the dealer hits, the player pays the payout. Exact stake and miss behaviour stay tunable.

## Card Effects

- Asymmetric and 8+ card flushes (e.g. Golden Heart counts as two Hearts) are allowed.
- Effects that choose a card take a configurable **target mode**: `best`, `worst`, `random`, `firstRevealed`, `lastRevealed`, etc.
- All randomness uses seeded, stream-separated RNG so hands replay exactly.
- Replays need seed **plus** build snapshot (deck, mutations, modifiers, automation).

## Information / Reveal

- Hidden-card knowledge (marked cards, peeks) is wanted; candidate mechanics include an **Early Raise** (commit after 4 cards for a higher cap), dealer peeks, and a side-bet decision window.
- Drama Director paces on what a card **could** mean (odds from the remaining shoe), never on what it **will** mean, so pacing does not spoil outcomes.

## Economy

- Numbers grow without limit: use `break_eternity.js` for bankroll and prices.
- The simulator works in **ante units** (plain numbers). The economy layer multiplies by the Decimal ante.
- Bankroll at or below 0 = game over (for now). A **stop-loss** automation rule is built in so 24h offline play cannot silently bankrupt a player.

## Time

- Dealer rotation runs on real time, derived from the clock (`hash(timeSlot) → dealer`), so no server is needed.
- Offline progression caps at 24 hours and runs the real simulator headless in a Web Worker.

## Technology

- TypeScript, Vite, React, GSAP for reveal timelines, ZzFX for procedural sound, CSS/SVG-drawn cards.
- npm workspaces:
  - `packages/sim` — pure simulation: no DOM, no timers, no `Math.random`.
  - `packages/balance` — CLI that runs large simulations.
  - `apps/game` — UI (later).
- The simulator takes a list of **seats** from day one so multiplayer (several players, one dealer, combined shoe) is an extension, not a rewrite.
