# Step 2: results the server decides

Status: every game is decided by the engine, built and tested locally on the
`server-authority` branch, not yet deployed (2026-11-10). Step 1 (Players Club accounts
and cloud saves) is live at idlesuits.crowbro.dev.

## Goal

A member's results can be trusted: the server holds the seed, runs the round,
and changes the bankroll; the browser only animates what the server returns.
Guests keep playing entirely in the browser, as now.

## Decided (2026-11-08)

- **Everything moves.** A member's game is decided entirely on the server; the client
  is only a view of it. Nothing a member's browser says is trusted: no reported
  results, no client-side bank, Tokens, charms or progress.
- **Games move live, one at a time.** Until a game has moved, members play it on a
  separate **practice bankroll** in the browser that never touches their real bank,
  Tokens, charms, stats or wins. Guests are unaffected.

## The engine: one copy of the rules, two hosts

All game rules and state changes live in `packages/engine`: pure TypeScript that takes
a player's state and an action and returns the new state and what happened:

```
act(state, action, ctx: { now, tuning, seed(game, round) }) → { state, result }
```

Two hosts run the same engine:

- **The server** (members): the player's Durable Object holds their state and the
  secret seed key; seeds are HMACs of the key, the game and the round, so the browser
  can't predict them.
- **The browser** (guests): the engine runs locally on the browser's save, as the game
  does today.

The game screens talk to a `GameHost` (remote or local) and animate what comes back,
so a game moved for members has also moved for guests, with one copy of its rules.

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

## Order

Games move one at a time; each launches when it's done:

1. Keno (self-contained, already fully seeded): proves the protocol.
2. The other instant games: Dynamite Dig, Deep Drop, Lucky Drop.
3. The slots (one engine for all five machines).
4. Roulette and the card tables (multi-step rounds: each decision is a request).

## The pit boss

The admin panel's tuning (payback, Token rate) moves to the server as a settings
table the pit boss edits through `/api/admin/*`; the server reads it when it decides
rounds. Bank and Token grants for testing become admin endpoints on a player's
Durable Object.

## First milestone: the foundation, with Keno

- `packages/engine`: the player state (wallet, charms, stats, wins, rooms), the charm
  machine (pull, equip, buy a slot), applying charms to a settled round, and Keno.
- `PlayerDO`: holds the state, the seed key, and answers `GET /api/state` and
  `POST /api/act`. A member's first visit moves their cloud save's bank, Tokens,
  charms and Keno progress in, once.
- The client: a `GameHost`; the bankroll, Tokens and charms read from it; Keno plays
  through it; the other games run on the practice bankroll for members.
- Pit boss tuning that Keno uses (instant payback, Token rate) stored on the server.

### As built

- `packages/engine`: `PlayerState` (one object: bank, floor, charms, stats, wins, Keno's
  progress), `act(state, action, ctx)` for every change, `playKeno` (one draw or an auto
  batch of up to 10), `settleRound` (charms, Tokens, bank, stats), the Charm Machine, and
  `playerFromSave` (reads a save from before the engine).
- `PlayerDO`: the state and a secret seed key in SQLite. A round's seed is
  HMAC-SHA256(key, `game:round`), worked out before the action runs; each action runs
  with other requests held off (`blockConcurrencyWhile`). The cloud save is stripped
  to its cosmetic keys. Each request counts against an allowance of 30, refilled at 4 a
  second; the pit boss is exempt.
- API: `GET /api/state` (state, tuning, the games the server plays), `POST /api/act`
  `{ action }`, `GET/PUT /api/admin/tuning`, `GET /api/admin/users/:id/state`,
  `POST /api/admin/users/:id/act`. Tuning is one D1 row (migration 0002), cached 10 s
  per Worker.
- Client: `lib/player.svelte.ts` holds the state (the server's for a member, the
  browser's under the `player` key for a guest) and a `hold` that keeps a decided
  draw's results off the screen until its animation reaches them. The bank, floor,
  charms, stats and wins stores read from it. Keno asks for 1 draw, or 5 under auto play.
- A new member starts fresh on the server: a guest's progress in the browser isn't
  moved into a new account, since it was never checked. Accounts that already had a
  cloud save are moved in once, on their first request.

## Every game, as built (2026-11-09 to 11-10)

The patterns, from simplest to most involved:

- **Decided at once, a batch for auto play**: Keno, Lucky Drop, roulette, the five slot
  machines (bonus and all; a pick bonus's picks are the machine's, the tiles tapped are
  only how they're shown), baccarat. The client holds each decided round's results off
  the screen (`player.holdBack`) until its animation reaches them.
- **A live round whose secrets come from its seed**: Dynamite Dig (the board, the cart's
  cave-ins and the vault's shares are rebuilt from the round's seed on each move, so
  nothing secret is stored in the state), and Deep Drop by hand (the snap point is never
  stored: a reel-in is checked against the server's clock, and `/api/watch` answers when
  the line snaps). Auto play's lines reel in at the marker, so they're decided at once.
- **Tables** (`tables.ts`, one adapter per game): Blackjack, baccarat, UTH, Three Card,
  Caribbean Stud, Crazy 4, Mississippi Stud, Let It Ride, Deuces Wild, Pai Gow and Idle
  Suits. The bets go down at the deal and raises as they're made, so walking away from
  a bad hand doesn't dodge it; a hand left mid-way resumes. Every move is checked
  against the offered choices and the bank. Shoes (Blackjack, baccarat) are shuffled
  from a secret seed per shoe; Blackjack's hole card is hidden until turned. Blind hands
  are dealt and settled by the engine. Auto play asks for up to 5 rounds on the strategy.
- **The progressives** are the engine's (per player for now): they grow with every round
  and with time at play (at most a minute between rounds), and the Major's must-hit
  point comes from a secret seed per Major.
- **The pit boss's tuning** includes slot payback, jackpot growth, blind hands and every
  game's rule overrides; for members it's the server's, for everyone.
- A member's first visit moves their old cloud save in once: bank, rooms, Tokens, charms,
  stats, wins, Keno, the Gem Vault, slot pots and the progressive meters. New members
  start fresh.

## Auto play on the server's clock (2026-11-10)

Turning auto play on stores the game's batch action, its stop rules and the table's speed
(`state.auto`); rounds come due at each game's pace by the server's clock. Any request settles
what's due (up to 5,000 a request). A watched table checks in about once a minute and shows those
rounds a minute behind; a hidden tab or closed browser sends nothing, and coming back settles up to
72 hours away and says what it came to. Stopping plays nothing unseen; a round played by hand stops
it. Seeds are worked out on demand by a synchronous HMAC (`seedFn`, the same seeds as before).

## Step 3: the shared progressive jackpot (2026-11-11)

- `JackpotDO` (one, global): the Grand and Major meters, the Major's must-hit point (from a secret
  seed per Major), and the last hits with the winner's card name. Every open casino holds a
  hibernating WebSocket (`/api/jackpot/live`, closed while the page is hidden) and gets the meters
  and hits as they change (at most every 3 s, a hit at once).
- A member's `PlayerDO` checks in before slot spins (meters, and whether the Major is due: it's
  held for one player at a time, so two can't both win it), reports its rounds (at most every 5
  minutes otherwise), and reports a hit at once. The engine plays against `ctx.link`.
- Guests see the shared meters in the lobby but play a private jackpot of their own.
- A member's actions go over a hibernating WebSocket to their own `PlayerDO` (`/api/live`) while
  the casino is shown: each a twentieth of a request, and no Worker request. Plain requests are
  the fallback; an action sent on the link is never re-sent by request.
- Pending round counts live in the PlayerDO's memory: if it's evicted between reports, a few
  minutes of contributions to the meters are lost (never a hit).

## Step 4: leaderboards (2026-11-11)

Four boards, each this week (from Monday, UTC) and all-time: biggest single win (dollars), best
multiplier (a win as a multiple of its bet), net winnings and Tokens earned. Every member's round
counts, except the pit boss's (they can mint money). Each `PlayerDO` keeps the player's records in
their state (`state.boards`) and writes changed rows to D1 (`scores`, migration 0003): a new best
at once, running totals at most every five minutes. `GET /api/leaderboard?board=&period=week|all`
gives the top 50 (cached 30 s per Worker) and the signed-in member's own place. The page is `#/leaders`.

Known follow-ups:

- Stopping auto play partway through a batch still shows the rounds already decided
  (up to four more), at the table's pace.
- The practice bankroll has no games left to serve; it stays for games added later.

## Open questions

- Traffic: auto play asks for 5 draws at a time (about 20 seconds of play per request).
  Revisit with real numbers.
