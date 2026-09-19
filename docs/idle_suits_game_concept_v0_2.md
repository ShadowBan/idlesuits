# Idle Suits — Game Concept v0.2

## High Concept

**Idle Suits** is an idle/deckbuilding card game inspired by high-card-flush casino games.

The player builds and manipulates a shared shoe, configures betting behavior, acquires powerful rule-breaking modifiers, and then lets repeated seven-card hands play out automatically.

The central emotional moment is not pressing **Deal**. It is:

> **Building a ridiculous card engine, watching that engine produce an improbable hand, and then sweating through the dealer's reveal to see whether it survives.**

Conceptually:

**Casino reveal tension + Balatro-style build construction + idle-game automation and scaling.**

The game should use fictional currency and its own visual identity, terminology, progression, and rule structure rather than presenting itself as a direct implementation of an existing branded casino game.

---

# 1. Core Design Pillars

## 1.1 Build Something Clever

Strong hands should feel like the result of systems the player deliberately assembled.

Possible ways to alter the game:

- Add cards
- Remove cards
- Change suits
- Change ranks
- Duplicate cards
- Mark cards
- Add abilities to individual cards
- Manipulate draw order
- Add redraws
- Affect dealer cards
- Change payout rules
- Change qualification rules
- Add or improve side bets
- Alter automatic betting behavior
- Introduce card effects that benefit one side more than the other

A successful build should eventually feel somewhat broken.

That is desirable.

---

## 1.2 Make the Reveal the Reward

The player already knows mathematically that their build is becoming stronger.

The game still needs to make them **want to watch it happen**.

A seven-card hand gives an excellent reveal structure because every flipped card changes the state of the hand.

Example:

```text
? ? ? ? ? ? ?
```

First card:

```text
♥ A
```

Second:

```text
♥ A   ♣ 7
```

Third:

```text
♥ A   ♣ 7   ♥ 9
```

The UI begins acknowledging:

```text
2 Hearts
```

Fourth:

```text
♥ A   ♣ 7   ♥ 9   ♥ Q
```

```text
3 Hearts
```

Fifth:

```text
♥ A   ♣ 7   ♥ 9   ♥ Q   ♦ 3
```

Sixth:

```text
♥ A   ♣ 7   ♥ 9   ♥ Q   ♦ 3   ♥ K
```

The fourth Heart should not merely increment a number.

The table reacts.

The suited cards tighten visually into a group.

The Heart icon pulses.

Audio changes.

The bet indicator responds.

Then:

```text
4-CARD FLUSH
```

The seventh card flips:

```text
♥ J
```

The reaction should be significantly larger:

```text
5-CARD FLUSH
```

The reveal is where the player sees their build fire.

---

## 1.3 The Dealer Is a Build Challenge

The dealer should not simply be an opponent with a different portrait.

Each dealer brings a **different deck contribution, rule pressure, and strategic problem**.

This means choosing or encountering a dealer changes:

- What cards enter the shoe
- Which suits become more or less dangerous
- Which side bets are attractive
- Which player builds perform well
- Which dealer-triggered effects must be countered
- How aggressively the player should automate betting

The dealer system should be one of the primary ways the game changes from session to session.

---

# 2. Core Hand Structure

A round starts with an Ante.

The player and dealer each receive seven cards.

The primary hand value is the largest number of cards sharing a suit.

Examples:

- 3-card flush
- 4-card flush
- 5-card flush
- 6-card flush
- 7-card flush

Within equally sized flushes, cards are compared by rank.

The exact qualification and payout rules should be tuned around progression and build diversity rather than copied exactly from a real-world game.

---

# 3. Shared Shoe

The shared shoe is a foundational mechanic.

Rather than:

```text
Player Deck
vs.
Dealer Deck
```

the game uses:

```text
PLAYER CARDS
      +
DEALER CARDS
      =
SHARED SHOE
```

Both sides draw from the same combined card pool.

This creates an important tension:

> Improving the overall shoe can help both sides.

If the player stuffs the shoe with Hearts, the player gets more Heart flushes.

But the dealer may also get more Heart flushes.

The build therefore becomes:

> **How do I manipulate a shared probability system in a way I can exploit better than the dealer?**

Player advantages can come from:

- Marked cards
- Player-only card abilities
- Dealer penalties
- Extra player draws
- Discards
- Peek abilities
- Suit conversion
- Betting intelligence
- Player-specific multipliers
- Dealer qualification manipulation

---

# 4. Dealer Decks

Every dealer brings cards to the table.

Those cards are shuffled together with the player's deck to create the current shared shoe.

Conceptually:

```text
Player Deck
+
Dealer Deck
+
Temporary Table Cards
=
Current Shoe
```

This makes the dealer function almost like a roguelike encounter or deckbuilding boss.

## Dealer Cards Can Be Hostile

A dealer's cards can introduce negative effects.

Examples:

### House Ace

```text
Ace of Spades

If dealt to the dealer:
Counts as the highest possible rank.

If dealt to the player:
Pays 20% less when used in a winning flush.
```

### Cold Heart

```text
4 of Hearts

When revealed by the player:
One other Heart temporarily loses its suit.
```

### House Wild

```text
Joker

Counts as any suit for the dealer.
Counts as no suit for the player.
```

### Tax Card

```text
Queen of Clubs

If this card is present in the winning dealer hand:
Dealer winnings are increased by 25%.
```

### Bad Beat

```text
8 of Diamonds

If this card completes a dealer flush:
Player loses an additional side-bet amount.
```

These cards contaminate the player's otherwise optimized shoe.

---

# 5. Positive / Bonus Dealers

Not every dealer needs to be hostile.

Some dealers can introduce unusually beneficial cards.

These could appear:

- Rarely
- During events
- As unlockable bonus encounters
- On special rotations
- After completing challenges

Example:

## Lucky Mina

Dealer deck:

```text
Golden Heart
Golden Heart
Wild Jack
Lucky Seven
Double-Up Queen
```

Most of her cards benefit whichever side receives them.

The challenge becomes maximizing how effectively the player exploits the temporary opportunity.

A bonus dealer therefore feels like:

> **A temporary high-value farming window.**

This is especially useful for an idle game because it gives players reasons to return during particular rotations without requiring PvP or time-limited punishment.

---

# 6. Dealer Rotation

Dealers rotate periodically.

Possible cadence:

- Every few hours
- Daily
- On a predictable schedule
- After a certain number of hands
- Through a manually selected progression map
- Some combination of scheduled and progression-based encounters

Example:

```text
Current Dealer
Dealer: Victor Vale
Remaining: 2h 14m

Next:
Mina — Lucky Deck

Later:
The Collector — Face Card Deck
```

The player should be able to inspect upcoming dealer decks.

This allows planning.

A player may think:

> "Mina arrives tonight. I should rebuild toward Wild cards before then."

Dealer rotation creates a metagame above individual hands.

---

# 7. Dealer Archetypes

Dealers should be defined by deck behavior, not just raw difficulty.

## The Suit Stacker

Adds many cards of one suit.

Effect:

- Larger flushes become common
- Dealer is dangerous
- Player can exploit the same suit

---

## The Polluter

Adds many off-suit low-value cards.

Effect:

- Makes clean deck builds less consistent
- Removal and filtering become valuable

---

## The Face Dealer

Adds many Kings, Queens, Jacks, and Aces.

Effect:

- Flush ties become dangerous
- High-rank strategies become more valuable

---

## The Wild Dealer

Adds several wild cards.

Effect:

- Huge hands occur frequently
- Variance rises dramatically

---

## The Taxman

Adds cards that steal chips or increase dealer payouts.

Effect:

- Player needs defensive modifiers
- Winning is not sufficient; margins matter

---

## The Saboteur

Adds cards that mutate player cards when revealed.

Effect:

- Highly disruptive
- Rewards resilient or redundant builds

---

## The Gambler

Brings strong side-bet cards.

Effect:

- Side-bet decisions become unusually important

---

## The Benefactor

Adds cards that usually help the player.

Effect:

- Temporary high-reward farming opportunity

---

# 8. Side Bets

Side bets should be one of the game's major strategic systems.

Examples:

## Flush Rush

Pays based on flush size.

## Straight Flush

Pays for suited sequences.

## Monochrome

Pays if all seven cards are red or black.

## Face Time

Pays based on suited face cards.

## Royal Hunt

Pays for collecting suited:

```text
10 / J / Q / K / A
```

## Mirror

Pays when the player and dealer achieve matching flush sizes.

---

# 9. Unclaimed Side Bets Belong to the Dealer

This is a core rule.

For every available side bet, the player chooses whether to fund it.

If the player **does not** place that side bet, the dealer claims that position instead.

If the dealer then satisfies that side bet's condition:

> **the dealer wins the corresponding payout from the player.**

Example:

Available side bets:

```text
Flush Rush     $100
Straight Flush $100
Face Time      $100
```

Player chooses:

```text
Flush Rush     PLAY
Straight Flush SKIP
Face Time      SKIP
```

This means:

```text
Flush Rush     Player owns
Straight Flush Dealer owns
Face Time      Dealer owns
```

If the dealer hits a Straight Flush condition, the player owes the payout.

This turns side bets into something much more interesting than optional bonus wagers.

They become:

> **Risk allocation.**

The player is deciding which outcomes they are willing to leave exposed.

---

# 10. Why Dealer Side Bets Matter

Traditional side bets often have a simple decision:

```text
Do I want more variance?
```

In Idle Suits the decision becomes:

```text
Which outcomes do I want to protect myself from?
```

Example:

A dealer's deck contains many face cards.

The player sees:

```text
FACE TIME
Dealer probability: HIGH
```

The player can pay to take the bet.

Doing so creates upside if the player hits it and prevents the dealer from using it.

Skipping it saves money now but leaves the player vulnerable.

This creates natural interaction between:

- Dealer identity
- Shoe composition
- Side-bet selection
- Player build
- Betting automation

---

# 11. Side Bets as Territory

A useful visual metaphor is that every side bet is a position on the table.

At the beginning of the hand, each position becomes controlled by either:

```text
PLAYER
```

or:

```text
DEALER
```

Example:

```text
┌──────────────────┐
│ FLUSH RUSH       │
│ PLAYER — $500    │
└──────────────────┘

┌──────────────────┐
│ STRAIGHT FLUSH   │
│ DEALER — $500    │
└──────────────────┘
```

Ownership should be visually obvious before the cards reveal.

Then, when a side-bet condition develops, that position begins reacting.

This provides additional tension during dealer reveals.

---

# 12. Side-Bet Automation

Because this is an idle game, the player eventually configures strategies.

Examples:

```text
Always play Flush Rush.
```

```text
Play Face Time if dealer deck has > 8 face cards.
```

```text
Play Straight Flush if current shoe contains ≥ 20 Hearts.
```

```text
Never spend more than 15% of Ante on total side bets.
```

```text
Protect any side bet where dealer expected payout exceeds $5,000.
```

This creates a second automation system alongside the normal Play/Fold betting logic.

---

# 13. Round Flow

A normal automated round:

## 1. Build the Shoe

Player deck and dealer deck are combined.

Temporary table modifiers are applied.

---

## 2. Ante

Configured Ante is deducted.

Ante-related modifiers trigger.

---

## 3. Side-Bet Ownership

For each side bet:

- Player funds it
- Or dealer claims it

The UI clearly shows ownership.

---

## 4. Player Cards Dealt

Seven cards hit the table face down.

---

## 5. Player Reveal

Cards reveal progressively.

Suit counters and card effects react in real time.

---

## 6. Main Betting Decision

Automation determines whether to:

- Fold
- Bet 1×
- Bet 2×
- Bet 3×
- Use a special action

---

## 7. Dealer Reveal

The dealer's hand becomes the main dramatic sequence.

Dealer side-bet opportunities are also resolved during this reveal.

---

## 8. Resolution

Calculate:

- Ante
- Main Play bet
- Player side bets
- Dealer-owned side bets
- Card modifiers
- Dealer-card effects
- Combo effects
- Multipliers
- Streak bonuses

---

## 9. Rewards / Losses

Money and secondary resources resolve visually.

---

## 10. Repeat

Next hand begins automatically.

---

# 14. Dynamic Reveal System

The reveal should **not always run at the same speed**.

The game should understand whether an upcoming card matters.

## Routine Hand

Example:

```text
♥
♣
♦
♠
♣
```

There is little tension.

Remaining cards reveal rapidly.

---

## Interesting Hand

Example:

```text
♥
♥
♥
?
```

The game slows slightly.

Fourth card:

```text
♥
```

Small celebration.

The remaining cards now matter more.

---

## Extreme Hand

Player currently has:

```text
♥A
♥K
♥J
♥9
♥6
♥4
?
```

The seventh card becomes a real event.

Table darkens slightly.

Other cards become visually subordinate.

Final card lifts.

Pause.

Flip.

```text
♥
```

Then:

```text
7-CARD FLUSH
```

Major celebration.

---

# 15. Dealer Reveal

The dealer reveal should produce a different emotion.

Player reveal:

> **What did my machine build?**

Dealer reveal:

> **Did it survive?**

Example:

Player has a five-Heart flush.

Dealer reveals:

```text
♣ A
♣ 10
♦ 8
♣ 7
```

UI:

```text
Dealer: 3 Clubs
```

Next:

```text
♣ Q
```

Now:

```text
Dealer: 4 Clubs
```

Next:

```text
♣ K
```

Now dealer has five Clubs.

The game shifts from:

```text
FLUSH SIZE
```

to:

```text
HIGH CARDS
```

But the reveal can also track dealer-owned side bets.

Example:

```text
FACE TIME
Dealer owns this bet.

Progress: 3 / 4
```

Now the final card can threaten both:

- The main hand
- A dealer side-bet payout

That creates layered tension.

---

# 16. Drama Director

Idle games eventually become fast.

If everything runs at 20× speed, the emotional core disappears.

The game therefore needs a **Drama Director**.

It classifies upcoming events.

## Routine

Reveal almost instantly.

## Interesting

Slow slightly.

## Strong Hand

Use normal cinematic pacing.

## Rare Hand

Slow reveal + celebration.

## Dangerous Dealer Draw

Pause and emphasize the next card.

## Dealer Side-Bet Threat

Show side-bet ownership and potential loss.

## Massive Payout

Full payoff animation.

## Massive Loss

Allow a meaningful but not overly punishing reaction.

Player options:

```text
Cinematic
Smart
Fast
Turbo
```

**Smart** should likely be the default.

---

# 17. Deckbuilding

The player's contribution to the shoe starts close to a standard deck and becomes increasingly strange.

## Remove Cards

```text
Remove one Diamond.
Remove every card below 5.
Remove one card permanently.
```

## Duplicate Cards

```text
Duplicate the King of Hearts.
Create another copy of every Ace.
```

## Suit Manipulation

```text
Change a card to Hearts.
Choose three cards and make them the same suit.
All face cards become Spades.
```

## Rank Manipulation

```text
Increase this card's rank.
All 2s become Queens.
Kings count as Aces during flush comparison.
```

## Wild Cards

```text
Counts as any suit.
Counts as the current majority suit.
Copies the previous revealed card's suit.
```

## Trigger Cards

```text
When revealed, draw another card.
When used in a flush, multiply winnings.
If dealt to the dealer, destroy and redraw.
```

---

# 18. Asymmetric Cards

The shared shoe becomes most interesting when cards behave differently depending on who draws them.

Example:

## Golden Heart

```text
Player:
Counts as two Hearts.

Dealer:
Counts as one Wild.
```

## Marked King

```text
Player:
Player sees this card before the reveal.

Dealer:
No special effect.
```

## House Queen

```text
Player:
Normal Queen.

Dealer:
+25% payout if part of the dealer's winning flush.
```

This creates the key deckbuilding question:

> **Is this card good enough for me to justify the risk of the dealer drawing it?**

---

# 19. Persistent Modifier Layer

In addition to cards, the player collects persistent table modifiers.

Possible naming:

- Tricks
- House Rules
- Charms
- Cheats
- Table Mods
- Tells
- Hustles
- Edges
- Rigs

Examples:

## Lucky Sleeve

Every fifth Heart revealed counts twice.

## Cold Deck

Dealer Aces count as Kings.

## Color Up

Every consecutive win increases payout by 10%.

Resets after a loss.

## One More Look

If the player has exactly three suited cards after seven cards, redraw the lowest off-suit card.

## House Favorite

Diamonds pay 25% more.

## Misdeal

Once every 20 hands, replace the dealer's highest card.

## Press Your Luck

5+ card flushes automatically increase the Play wager.

## Perfect Information

Reveal one dealer card before the main betting decision.

## Insurance Agent

The first dealer-owned side bet that hits each run pays only 50%.

## Table Claim

One side bet of your choice is always owned by the player for free.

---

# 20. Automation as a Build System

Automation itself should become progression.

Early game:

```text
3-card flush → Bet 1×
4-card flush → Bet 1×
5-card flush → Bet 2×
6+ flush     → Bet 3×
```

Later:

```text
IF flush ≥ 5
AND hand contains Golden Heart
THEN bet MAX
```

or:

```text
IF dealer deck contains > 25% face cards
THEN always claim Face Time
```

or:

```text
IF dealer owns Straight Flush
AND dealer has 3 suited sequential cards
THEN activate defensive redraw
```

The interface should not resemble programming.

It should look like configurable strategy cards.

---

# 21. Economy

Primary currency:

```text
Chips / Money
```

Scale can become extreme:

```text
$5
$50
$5,000
$2,000,000
$4,000,000,000
```

Money can buy:

## Ante Increases

Greater risk and reward.

## Table Upgrades

- Faster dealing
- More modifier slots
- Better payouts
- More side-bet control

## Card Shop

Deck modifications.

## Modifier Shop

Persistent Tricks / Edges.

## Information

Potentially:

- Dealer deck previews
- Side-bet probability estimates
- Upcoming rotation details

---

# 22. Casino / Table Progression

The game can move through increasingly strange casinos.

Example:

```text
Neighborhood Casino
Downtown Casino
Luxury Resort
Private High-Roller Room
Offshore Casino
Underground Casino
Impossible Casino
Casino at the End of Time
```

Each location can introduce different rules.

## High Roller Room

- Higher minimum bets
- Dealer qualifies more easily
- Rewards increase

## Underground Table

- Corrupted cards appear
- Illegal modifiers become available

## Impossible Casino

- Additional suits
- Strange hand rules
- Non-standard cards

Dealer pools can also differ by location.

---

# 23. Dealer Collection / Progression

Dealers themselves can become content.

The player can maintain a **Dealer Book**.

Each dealer entry shows:

- Portrait
- Personality
- Deck composition
- Known dangerous cards
- Known beneficial cards
- Side-bet tendencies
- Hands played
- Win/loss history
- Best payout
- Dealer-specific challenges

Possible goals:

```text
Beat Victor 100 times.
Win $1M against Mina.
Hit a 7-card flush while facing The Polluter.
Win every side bet against The Gambler in one hand.
```

This gives dealer rotation long-term collection value.

---

# 24. Prestige System

Eventually the current build reaches diminishing returns.

The player can:

```text
CASH OUT
```

Cash Out resets some combination of:

- Money
- Table progression
- Player deck
- Temporary modifiers

In exchange for a permanent resource.

Possible name:

```text
Reputation
```

Reputation unlocks:

- Better starting cards
- More modifier slots
- New mutation types
- Advanced automation
- New side bets
- New dealers
- Better dealer intelligence
- Faster base dealing

---

# 25. Offline Progression

Background simulation should not attempt to animate every hand.

Instead, simulate mathematically.

When the player returns:

```text
WHILE YOU WERE AWAY

4,821 hands played
$18.4M earned
37 six-card flushes
1 seven-card flush
12 dealer side bets hit
Largest payout: $2.7M
Largest dealer win: $410K
```

Then:

```text
WATCH HIGHLIGHTS
```

The game can reconstruct interesting hands.

Possible highlights:

- Best hand
- Biggest payout
- Closest dealer showdown
- Worst dealer side-bet loss
- Longest win streak
- Rare modifier interaction
- First encounter with a special dealer card

This preserves the value of the reveal system even during offline play.

---

# 26. Example Midgame Hand

Current dealer:

```text
Victor Vale
"The House Always Collects"
```

Victor's deck contribution:

```text
12 cards

4 House Face Cards
3 Tax Cards
2 Wild Clubs
3 normal cards
```

Player deck:

```text
56 cards

Hearts:   24
Clubs:    10
Spades:   11
Diamonds: 11
```

Active modifiers:

### Bleeding Heart

Every fourth Heart revealed adds +25% payout.

### Heartbreaker

If the dealer reveals 3+ Hearts, one dealer Heart loses its suit.

### Table Claim

Flush Rush is always owned by the player.

Available side bets:

```text
Flush Rush
Face Time
Straight Flush
```

Ownership becomes:

```text
Flush Rush      PLAYER
Face Time       DEALER
Straight Flush  PLAYER
```

This matters because Victor's deck contains many face cards.

Player reveal:

```text
♥ Q
♥ 8
♣ A
♥ K
♥ 4
♦ 9
♥ A
```

Result:

```text
5-Card Heart Flush
```

Bleeding Heart activates.

Payout multiplier:

```text
×1.25
```

Dealer reveal:

```text
♠ K
♥ J
♥ 3
♣ Q
```

Victor now has two face cards.

The dealer-owned **Face Time** side bet begins glowing.

Next:

```text
♥ 9
```

Three Hearts trigger Heartbreaker.

One dealer Heart burns into a neutral card.

Next:

```text
♣ K
```

Now dealer has:

```text
3 Face Cards
```

Face Time shows:

```text
3 / 4
```

Final dealer card lands face down.

The Drama Director slows the game.

The main hand is still beatable.

But the dealer-owned side bet is now also threatening a large loss.

Card flips:

```text
♦ 2
```

Face Time misses.

Player wins.

The satisfaction comes from several intentionally built systems interacting:

- Shoe composition
- Dealer deck
- Side-bet ownership
- Player modifiers
- Reveal tension
- Defensive effects
- Main-hand resolution

---

# 27. Visual Information Hierarchy

The player should always understand three things.

## What do I currently have?

Example:

```text
♥ ×5
```

## What is the dealer threatening?

Example:

```text
♣ ×4
```

and:

```text
FACE TIME
Dealer-owned
3 / 4
Potential loss: $12,500
```

## Why is this payout changing?

Example:

```text
Base Win             $4,000
Bleeding Heart       ×1.25
5-Card Flush         ×3
Winning Streak       ×2.1
Flush Rush           +$8,000
--------------------------------
TOTAL                $39,500
```

Large outcomes should always be explainable.

---

# 28. Juice / Feedback

## High-Frequency Feedback

- Card snap sounds
- Chips moving
- Card flips
- Suit counters
- Side-bet ownership
- Small payout ticks

## Medium Events

- Modifier activation
- Four-card flush
- Dealer threat
- Side-bet threat
- Win-streak increase

## Large Events

- Six-card flush
- Huge side-bet win
- Dealer side-bet loss
- Dealer upset

## Extremely Rare Events

- Seven-card flush
- Massive combo chain
- Record payout
- Extremely rare dealer card interaction

Rare events should be allowed to interrupt idle-game speed.

That interruption communicates importance.

---

# 29. MVP Vertical Slice

The first prototype should deliberately remain small.

Do **not** initially build:

- Prestige
- Multiple casinos
- Hundreds of modifiers
- Large dealer roster
- Elaborate final art
- Online systems
- Full long-term economy

Build:

## Base Deck

52-card player deck.

## Shared Shoe

Player deck plus current dealer contribution.

## Dealers

Three prototype dealers:

### Dealer A — Neutral

Mostly normal cards.

### Dealer B — Hostile

Adds clearly negative cards.

### Dealer C — Beneficial

Adds several player-friendly or symmetric bonus cards.

## Hand Evaluation

Correct flush-size and rank comparison.

## Auto Loop

Rounds continuously resolve.

## Money

Ante, Play wager, side bets, payouts.

## Side-Bet Ownership

At least three side bets.

If player skips one, dealer owns it.

## Reveal Presentation

Sequential player and dealer reveals.

## Dynamic Reveal Timing

At least basic detection of dramatic situations.

## Deck Editing

Developer controls to:

- Remove cards
- Duplicate cards
- Change suits

## Modifiers

Five to ten modifiers.

## Speed Controls

```text
1×
2×
5×
Smart
```

The vertical slice should answer:

> **Is it fun to build a biased shared shoe, choose which side-bet risks to leave exposed, and watch that machine repeatedly resolve against dealers who contaminate the shoe in different ways?**

---

# 30. Technical Architecture

Simulation should be separated from presentation.

Conceptually:

```text
RoundSimulator
```

produces an event stream.

Example:

```text
ShoeBuilt
AntePlaced
SideBetClaimedByPlayer
SideBetClaimedByDealer
DealPlayerCard
RevealPlayerCard
CardEffectTriggered
ModifierTriggered
BetPlaced
DealDealerCard
RevealDealerCard
DealerThreatChanged
SideBetProgressChanged
DealerCardEffectTriggered
HandResolved
SideBetResolved
PayoutCalculated
```

The UI consumes those events.

Benefits:

- Offline simulation
- Balance testing
- Fast-forward
- Deterministic replays
- Automated testing
- AI analysis
- Animation independent of game state

---

# 31. Dealer Architecture

Dealer data should be content-driven rather than hardcoded.

Conceptually:

```text
Dealer {
  id
  name
  portrait
  personality
  deckContribution[]
  passiveEffects[]
  sideBetModifiers[]
  payoutModifiers[]
  revealStyle
  difficultyTags[]
  scheduleRules
}
```

Example:

```text
Dealer: Victor Vale

Deck:
- 2 House Kings
- 2 House Queens
- 3 Tax Cards
- 2 Wild Clubs
- 3 Standard Cards

Passive:
Dealer-owned side bets pay +20%.

Trait:
Face-card-heavy.
```

This architecture makes adding new dealers primarily a content task.

---

# 32. Deterministic Hands

Each round should ideally be reproducible from a seed.

Example:

```text
runSeed + dealerID + roundNumber
```

Benefits:

- Replay interesting hands
- Offline highlights
- Debug modifier chains
- Verify payouts
- Share memorable hands
- Reproduce bugs

Potential future feature:

```text
SHARE HAND
```

A player sends a short code.

Another player can replay the same hand.

---

# 33. Balance Tooling

This should be built early.

The simulator should run hundreds of thousands or millions of hands and report:

- Player win rate
- Dealer win rate
- Expected value
- Average flush size
- Flush distribution
- Player side-bet EV
- Dealer side-bet EV
- Income per hand
- Modifier contribution
- Dealer-card contribution
- Dealer matchup results
- Build performance by dealer
- Variance
- Largest wins/losses

For example:

```text
Build: Mono Hearts
Dealer: Victor Vale
Simulated Hands: 1,000,000

Player Main-Hand EV:      +4.8%
Player Side-Bet EV:       +7.1%
Dealer Side-Bet EV:       -5.3%
Combined EV:              +6.6%

Average Player Flush:     4.31
Average Dealer Flush:     3.72
```

This will be critical once deck mutation, side-bet ownership, and dealer cards begin interacting.

---

# 34. Major Design Risks

## Idle Speed Could Destroy the Reveal

If optimal play becomes watching 100 hands per second, the signature experience disappears.

Mitigation:

- Smart pacing
- Highlight replays
- Rare-event interruptions
- Configurable reveal modes

---

## One Suit Could Become Obviously Optimal

If deleting three suits always wins, deckbuilding becomes shallow.

Mitigation:

- Dealer benefits from the same shared shoe
- Dealer-specific contamination
- Suit-sensitive side bets
- Asymmetric cards
- Card limits
- Counter-dealers

---

## Always Taking Every Side Bet Could Become Correct

If players eventually have enough money to fund every side bet without consequence, the ownership mechanic becomes irrelevant.

Possible solutions:

- Side bets consume limited table slots
- Increasing side-bet costs
- Side-bet opportunity cost
- Dealer effects that punish overcoverage
- Maximum total side-bet exposure
- Some modifiers reward leaving bets dealer-owned
- Side-bet payouts scale with risk

This is an important balance question.

---

## Dealer Rotation Could Feel Punishing

Players should not feel that the game becomes unplayable because the wrong dealer appeared.

Dealer differences should create:

```text
"How should I adapt?"
```

rather than:

```text
"I cannot play for six hours."
```

Bonus dealers can help create positive anticipation.

---

## Modifier Interactions Could Become Hard to Understand

Every effect should have clear visual causality.

The player needs to see:

```text
Card → Trigger → Modifier → Result
```

rather than unexplained number changes.

---

## Dealer Could Feel Like Random Punishment

Dealer effects should be visible and learnable.

The player should know what cards the dealer brought into the shoe and why something happened.

---

# 35. Prototype Success Criteria

The prototype is promising if testers repeatedly:

- Watch strong hands instead of always skipping them
- Understand why their build produced an outcome
- Change their deck after observing weak hands
- Feel tension during dealer reveals
- Care which dealer is currently active
- Plan around upcoming dealer rotations
- Debate which side bets to protect
- Feel regret when a dealer hits an unclaimed side bet
- Feel clever when leaving a side bet exposed was the right decision
- Discover multiple viable builds
- Enjoy modifier chains firing
- Want one more upgrade before stopping

Most importantly:

> **When seven face-down cards land on the table, the player should still care what is underneath them—even after thousands of hands.**

---

# 36. Questions for Developer Evaluation

The first engineering/design evaluation should focus on these questions.

## Simulation

Can several thousand or million hands be simulated cheaply enough for:

- Offline progression
- Balance analysis
- Dealer matchup simulations
- Build comparisons

## Determinism

Can an entire hand and modifier chain be recreated exactly from a seed?

## Shared Shoe

Is combining mutable player and dealer card pools straightforward and performant?

## Modifier Architecture

Can modifiers subscribe to game events without creating an unmaintainable collection of special cases?

## Dealer Content

Can new dealer decks and passive effects be added primarily through configuration/data?

## Side-Bet Ownership

Can side bets cleanly support:

```text
Player-owned
Dealer-owned
Neutral / disabled
```

while using the same resolution system?

## Card Mutation

Can individual cards retain permanent mutations?

Example:

```text
Ace of Hearts

Foil
Counts twice
+20% payout
Cannot be dealt to dealer
```

## Reveal System

Can animation timing remain completely independent from actual simulation?

## Drama Detection

Can the game evaluate whether an upcoming reveal is:

- Routine
- Valuable
- Dangerous
- Rare
- Side-bet critical

and select presentation timing accordingly?

## Balance Tooling

Can the simulator produce useful aggregate analytics early enough to guide design rather than merely validate it later?

---

# 37. Recommended First Prototype

The best first playable prototype is not a complete idle game.

It is one table with:

```text
1 player deck
3 dealers
3 side bets
8 modifiers
1 shared shoe
1 smart reveal system
```

The player should be able to:

1. Modify the deck.
2. Select or encounter a dealer.
3. See exactly what that dealer adds to the shoe.
4. Configure side-bet ownership rules.
5. Start auto-play.
6. Watch hands resolve.
7. See dramatic reveals when something important happens.
8. Review basic run statistics.
9. Rebuild and try again.

If that loop is compelling, the larger idle progression system has something worth amplifying.

If it is not compelling, prestige systems, casinos, currencies, and content volume will not fix it.
