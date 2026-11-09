# Step 2: results the server decides

Status: planned (2026-11-08). Step 1 (Players Club accounts and cloud saves) is live at
idlesuits.crowbro.dev.

## Goal

A member's results can be trusted: the server holds the seed, runs the round,
and changes the bankroll; the browser only animates what the server returns.
Guests keep playing entirely in the browser, as now.

## What moves to the server, and why together

Each member's Durable Object (`PlayerDO`) becomes the only thing that can change:

- **The wallet:** the bank (a `break_eternity` Decimal, as the client uses) and the Tokens.
- **The charms:** the collection, the loadout and slots, and the charm run state (streaks).
  Charms add cash and Tokens to results, so trusted results need them server-side too.
  The Charm Machine's pulls move with them, since they spend Tokens.
- **Each moved game's own progress:** for Keno, the ticket, the Gold Card and its pots,
  the pattern meters and the buff queue (all of them change what a draw pays).
- **The lifetime stats:** counted where the rounds settle.

These leave the cloud save (which becomes cosmetic: table bets, preferences).

## The round protocol

```
POST /api/play/keno  { ticket, bet, auto?: n }
  → PlayerDO: check the bank covers the bet(s); for each round:
      seed = hash(server secret, player, round number)   (never sent before the round)
      run packages/sim (kenoDraw, kenoSettle, kenoStamp, kenoAfterDraw)
      apply the charms (applyCharms), move the bank and Tokens, record stats and wins
  ← { rounds: [{ round, balls, result, card, buffs, pay, tokens, ... }], bank, tokens }
```

- `auto: n` plays up to n rounds in one request (approved: batched auto play keeps
  traffic down). The client animates them one by one; a big win or a stop rule ends
  the batch early on the server, so holds and stops still work.
- Rounds are numbered per player; a replay asks for a past round by number and the
  server re-runs it from its stored seed.
- Step 5 (provably fair) later commits a hash of each seed before the round and
  reveals the seed after.

## Games not moved yet (during the move)

Option (a), recommended: they keep running in the browser and report each round's
result (`POST /api/report`). Those reports are trusted only as far as the browser,
so leaderboards wait until every game has moved. Games move one at a time:

1. Keno (self-contained, already fully seeded): proves the protocol.
2. The other instant games: Dynamite Dig, Deep Drop, Lucky Drop.
3. The slots (one engine for all five machines).
4. Roulette and the card tables (multi-step rounds: each decision is a request).

## The pit boss

The admin panel's tuning (payback, Token rate) moves to the server as a settings
table the pit boss edits through `/api/admin/*`; the server reads it when it decides
rounds. Bank and Token grants for testing become admin endpoints on a player's
Durable Object.

## Open questions

- During the move, should unmoved games keep touching the real bankroll (option a),
  run as "practice" off it (b), or should all instant games move before the bankroll
  switches (c)?
- Traffic: what batch size (`auto: n`) and minimum time between requests per player.
