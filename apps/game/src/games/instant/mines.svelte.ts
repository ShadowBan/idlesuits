import { minesProgress, type MinesLive, type MinesReplay, type MinesRound, type MinesStep } from '@idlesuits/engine';
import { CART_TRACKS, minesBoard, minesState, MINES_MAX_BOMBS, MINES_TILES, VAULT_FULL, type MinesFind, type MinesTile } from '@idlesuits/sim';
import { autoplay } from '../../lib/autoplay.svelte';
import { floor } from '../../lib/floor.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal, formatMoney } from '../../lib/money';
import { playOrAuto, SPEED } from '../../lib/autofeed.svelte';
import { player } from '../../lib/player.svelte';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

export type { MinesReplay };

/** Milliseconds at 1×: between auto play's digs, and before its next round. */
const AUTO_DIG_MS = 420;
const AUTO_NEXT_MS = 1200;
/** The square that decided a round holds the eye this long before the rest of the board is shown. */
const REVEAL_MS = 650;
/** Rounds auto play asks for at once. */
const AUTO_BATCH = 3;

/** A cart ride in progress: the cave-ins found so far, the tracks taken, and what it has added. */
export interface CartRide {
  caves: number[];
  picks: number[];
  x: number;
  /** Caved in on the last pick. */
  caved: boolean;
  done: boolean;
}

/** The vault's bonus board in play: the shares found under its squares, and the picks. */
export interface VaultBonus {
  /** By square; NaN until it's opened (all of them once the board is done). */
  squares: number[];
  picked: number[];
  /** The vault's cash it pays a share of. */
  cash: Decimal;
  done: boolean;
}

/** Between squares in a replay. */
const REPLAY_DIG_MS = 420;

/**
 * Dynamite Dig: Mines. The player buries 1–24 sticks of dynamite in 25
 * squares, stakes the bet and digs. Gems and stars raise the cash-out (see
 * `minesState`), a mine cart takes a ride that multiplies it, and dynamite
 * loses the bet. Every find also drops cash in the Gem Vault, which carries
 * over between rounds and, once full, opens a free bonus board after the round.
 *
 * Every move is answered by the engine (on the server, for a member), which
 * alone knows the board: this shows what each dig turned up, and the whole
 * board once the round is over.
 */
export class MinesGame extends InstantGame {
  /** Sticks of dynamite on the next board. Saved. */
  bombs = $state(3);
  /** Squares auto play digs each round before it cashes out. Saved. */
  autoDigs = $state(3);
  /** What each dug square showed, by index. */
  dug = $state<Record<number, MinesTile>>({});
  /** The safe finds this round, in order. */
  found = $state<MinesFind[]>([]);
  /** The round in play: its seed number and stake, and how many bombs its board has. */
  live = $state<{ round: number; bet: Decimal; bombs: number } | null>(null);
  /** How the last round ended: on dynamite (at its square) or cashed out, and what it paid. */
  ended = $state<{ how: 'boom' | 'cashed'; at: number; pay: Decimal } | null>(null);
  board = $state<MinesTile[] | null>(null);
  /** The whole board is showing, after a round. */
  shown = $state(false);
  /** A cart ride under way. */
  ride = $state<CartRide | null>(null);
  /** The Gem Vault as shown: cash set aside by every find, and the finds toward opening it. */
  vaultCash = $state(new Decimal(0));
  vaultFinds = $state(0);
  /** The vault's bonus board, after the round that filled it. */
  bonus = $state<VaultBonus | null>(null);
  /** Counts finds, so the vault can pulse as cash drops in. */
  drops = $state(0);
  /** The round that just settled, as the wins list keeps it to replay. */
  lastReplay = $state<MinesReplay | null>(null);
  /** A kept board being dug again: nothing staked, nothing paid. */
  replaying = $state.raw<MinesReplay | null>(null);
  /** The replay has dug its last square: its board holds until the player moves on. */
  replayDone = $state(false);
  /** Why the last move couldn't be made, for a moment on screen. */
  error = $state<string | null>(null);
  /** A move is on its way to the engine. */
  private asking = $state(false);
  /** Moves held back until the player has seen the ride or the vault's board finish. */
  private waiting: { steps: MinesStep[]; rounds: MinesRound[]; holds: number[] } | null = null;
  /** The settled round a finished vault board is waiting to pay. */
  private settling: { round: MinesRound; hold: number | null } | null = null;
  /** Auto play is showing rounds already decided. */
  private showing = false;
  private vaultShare = 0;

  constructor() {
    super('mines');
    const bombs = load<number>('mines.bombs', 3);
    this.bombs = Number.isInteger(bombs) && bombs >= 1 && bombs <= MINES_MAX_BOMBS ? bombs : 3;
    const autoDigs = load<number>('mines.autoDigs', 3);
    this.autoDigs = Number.isInteger(autoDigs) && autoDigs >= 1 ? Math.min(autoDigs, MINES_TILES - this.bombs) : 3;
    this.syncVault();
    this.resume();
  }

  /** The vault as the engine has it. */
  private syncVault() {
    const p = minesProgress(player.shown);
    this.vaultCash = new Decimal(p.vault.cash);
    this.vaultFinds = p.vault.finds;
  }

  /** A round left in play (the page closed mid-dig): back on the board as it was. */
  private resume() {
    const live = minesProgress(player.truth).live;
    if (!live) return;
    this.showLive(live);
  }

  private showLive(live: MinesLive) {
    const bet = new Decimal(live.bet);
    this.bombs = live.bombs;
    this.live = live.ended ? null : { round: live.round, bet, bombs: live.bombs };
    this.dug = Object.fromEntries(live.dug.map((d) => [d.square, d.tile]));
    this.found = live.found;
    this.ride = live.ride ? { ...live.ride } : null;
    this.board = null;
    this.shown = false;
    this.ended = live.ended ? { how: live.ended.how, at: live.ended.at, pay: bet.mul(live.ended.pay) } : null;
    if (live.bonus) {
      const squares = Array<number>(MINES_TILES).fill(NaN);
      live.bonus.picked.forEach((sq, i) => (squares[sq] = live.bonus!.shares[i]!));
      this.bonus = { squares, picked: live.bonus.picked, cash: new Decimal(live.bonus.cash), done: false };
    }
  }

  setBombs(n: number) {
    if (this.live || this.busy) return;
    this.bombs = Math.min(MINES_MAX_BOMBS, Math.max(1, n));
    this.autoDigs = Math.min(this.autoDigs, MINES_TILES - this.bombs);
    save('mines.bombs', this.bombs);
  }

  setAutoDigs(n: number) {
    this.autoDigs = Math.min(MINES_TILES - this.bombs, Math.max(1, n));
    save('mines.autoDigs', this.autoDigs);
  }

  /** Where the round stands, and what the next dig can do. */
  get state() {
    return minesState(this.live?.bombs ?? this.bombs, this.found, this.rtp);
  }

  /** The cash-out now, in bets: 0 before the first find. */
  get cashout(): number {
    return this.live ? this.state.value : 0;
  }

  /** Safe squares still buried. */
  get safeLeft(): number {
    const s = this.state;
    return s.gemsLeft + s.starsLeft + s.cartsLeft;
  }

  /** Something is under way that the player can't interrupt with a new dig. */
  get busy(): boolean {
    return this.asking || this.showing || this.ride !== null || this.bonus !== null || (this.replaying !== null && !this.replayDone);
  }

  get canBet(): boolean {
    return player.ready && super.canBet;
  }

  /** Sends a move to the engine and shows what it did. False if it was refused. */
  private async move(action: Parameters<typeof player.act>[0]): Promise<boolean> {
    if (this.asking) return false;
    this.asking = true;
    let holds: number[] = [];
    const before = player.shown.floor.best;
    const out = await player.act(action, (landed) => {
      const r = landed.result && 'steps' in landed.result ? landed.result : null;
      // A round settled by a move made by hand shows at once; only a vault board left to see holds it back.
      if (r?.rounds.length) {
        holds = player.holdBack(r.rounds, before);
        // Its stake went down when it began: what's held is all it pays back.
        r.rounds.forEach((round, i) => player.start(holds[i]!, round));
      }
    });
    this.asking = false;
    if (!out.ok) {
      this.error = out.error;
      return false;
    }
    this.error = null;
    const r = out.result && 'steps' in out.result ? out.result : { steps: [], rounds: [] };
    this.apply(r.steps, r.rounds, holds);
    return true;
  }

  /**
   * Shows moves the engine made. A ride that finishes holds the rest back
   * until the player has seen it (`endRide`); a vault board holds its round's
   * money until it's collected (`closeBonus`).
   */
  private apply(steps: MinesStep[], rounds: MinesRound[], holds: number[]) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      this.show(step);
      if (step.kind === 'track' && step.done) {
        if (i < steps.length - 1 || rounds.length) {
          this.waiting = { steps: steps.slice(i + 1), rounds, holds };
          return;
        }
      }
    }
    rounds.forEach((r, i) => this.settleRound(r, holds[i] ?? null));
    if (!rounds.length) {
      // The round ended into the vault's bonus board: it opens once the board has been seen.
      const live = minesProgress(player.truth).live;
      if (live?.ended && live.bonus && !this.bonus) this.openVault(live);
    }
  }

  /** One move on the board. */
  private show(step: MinesStep) {
    switch (step.kind) {
      case 'begin':
        this.live = { round: -1, bet: new Decimal(step.bet), bombs: step.bombs };
        this.board = null;
        this.dug = {};
        this.found = [];
        this.ended = null;
        this.shown = false;
        sfx.chip();
        return;
      case 'dig': {
        this.dug = { ...this.dug, [step.square]: step.tile };
        if (step.tile === 'bomb') {
          sfx.lose();
          this.ended = { how: 'boom', at: step.square, pay: new Decimal(0) };
          this.live = null;
          return;
        }
        this.dropInVault();
        if (step.tile === 'cart') {
          sfx.spin();
          this.ride = { caves: [], picks: [], x: 1, caved: false, done: false };
          return;
        }
        this.found = [...this.found, { tile: step.tile }];
        if (step.tile === 'star') sfx.bigWin();
        else sfx.coin(this.found.length);
        return;
      }
      case 'track': {
        const ride = this.ride;
        if (!ride) return;
        ride.picks = [...ride.picks, step.track];
        ride.x = step.x;
        ride.caved = step.caved;
        ride.done = step.done;
        if (step.caved) ride.caves = [...ride.caves, step.track];
        if (step.caved) sfx.lose();
        else sfx.coin(ride.picks.length * 2);
        if (step.done) this.found = [...this.found, { tile: 'cart', cart: step.x }];
        return;
      }
      case 'cash':
        if (this.live) this.ended = { how: 'cashed', at: -1, pay: this.live.bet.mul(this.state.value) };
        this.live = null;
        sfx.win();
        return;
      case 'open': {
        const b = this.bonus;
        if (!b) return;
        b.squares = b.squares.map((v, i) => (i === step.square ? step.share : v));
        b.picked = [...b.picked, step.square];
        sfx.coin(b.picked.length * 2);
        if (b.picked.length >= 5) {
          b.done = true;
          sfx.bigWin();
        }
        return;
      }
    }
  }

  /** Every find drops a share of the bet into the vault, as shown. */
  private dropInVault() {
    if (!this.live) return;
    this.vaultCash = this.vaultCash.add(this.live.bet.mul(this.state.vault));
    this.vaultFinds = Math.min(VAULT_FULL, this.vaultFinds + 1);
    this.drops++;
  }

  private openVault(live: MinesLive) {
    if (!live.bonus) return;
    this.bonus = { squares: Array<number>(MINES_TILES).fill(NaN), picked: [], cash: new Decimal(live.bonus.cash), done: false };
    setTimeout(() => sfx.bigWin(), REVEAL_MS);
  }

  /** A round the engine settled: the board, its result, and its place in the session. */
  private settleRound(r: MinesRound, hold: number | null) {
    const board = r.board;
    this.board = board;
    this.live = null;
    this.ended = { how: r.how, at: r.at, pay: new Decimal(r.bet).mul(r.pay) };
    // A moment on the square that decided it, then the rest of the board: this round's board only.
    setTimeout(() => {
      if (this.board === board) this.shown = true;
    }, REVEAL_MS);
    if (r.vault && !this.bonus?.done) {
      // The vault opened with this round and hasn't been seen yet: its board first, then the round.
      this.bonus = { squares: r.vault.squares, picked: r.vault.picked, cash: new Decimal(r.vault.cash), done: true };
      this.settling = { round: r, hold };
      return;
    }
    if (r.vault && this.bonus) {
      this.bonus.squares = r.vault.squares;
      this.settling = { round: r, hold };
      return;
    }
    this.count(r, hold);
  }

  /** A settled round counts in the session and shows its money. */
  private count(r: MinesRound, hold: number | null) {
    const bet = new Decimal(r.bet);
    if (hold !== null) player.reveal(hold);
    this.lastReplay = r.replay;
    this.vaultShare = r.vault?.share ?? 0;
    meta.showFlash(r.triggers, r.tokens, bet);
    this.record({ bet, pay: r.x, units: r.net, lines: r.lines, text: r.text, sub: r.sub, onHouse: r.onHouse });
    autoplay.round(r.net, this.bank);
    this.syncVault();
  }

  /** Stakes the bet and deals a fresh board. */
  begin(): boolean {
    if (this.live || this.busy || !this.canBet) return false;
    this.closeReplay();
    void this.move({ type: 'mines.begin', bombs: this.bombs, step: this.step, room: floor.current });
    return true;
  }

  /** Digs a square; with no round on, a dig starts one and digs it. */
  async dig(i: number) {
    if (this.busy || this.dug[i] !== undefined && this.live) return;
    if (!this.live) {
      if (!this.canBet) return;
      this.closeReplay();
      if (!(await this.move({ type: 'mines.begin', bombs: this.bombs, step: this.step, room: floor.current }))) return;
    }
    if (this.dug[i] !== undefined) return;
    await this.move({ type: 'mines.dig', square: i });
  }

  /** The cart takes a track at its junction. */
  takeTrack(track: number) {
    const ride = this.ride;
    if (!ride || ride.done || this.asking || track < 0 || track >= CART_TRACKS) return;
    void this.move({ type: 'mines.track', track });
  }

  /** The ride is over and seen: digging resumes, and whatever the ride finished goes on. */
  endRide() {
    if (!this.ride?.done) return;
    this.ride = null;
    sfx.win();
    this.resumeWaiting();
  }

  private resumeWaiting() {
    const w = this.waiting;
    this.waiting = null;
    if (w) this.apply(w.steps, w.rounds, w.holds);
  }

  /** Digs a square at random (or, mid-ride, takes a track at random; on the vault's board, opens one). */
  digRandom() {
    if (this.ride) {
      if (this.ride.done) this.endRide();
      else this.takeTrack(Math.floor(Math.random() * CART_TRACKS));
      return;
    }
    if (this.bonus) {
      if (this.bonus.done) this.closeBonus();
      else {
        const free = this.bonusFree();
        this.openSquare(free[Math.floor(Math.random() * free.length)]!);
      }
      return;
    }
    if (!this.live) return;
    const open = Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => this.dug[i] === undefined);
    void this.dig(open[Math.floor(Math.random() * open.length)]!);
  }

  cashOut() {
    if (!this.live || !this.found.length || this.busy) return;
    void this.move({ type: 'mines.cash' });
  }

  /**
   * Digs a kept board again, exactly: the same board from its seed, the same
   * squares in the same order, then the cash-out and the whole board. Nothing
   * is staked or paid. Auto play stops for it.
   */
  async replay(d: MinesReplay) {
    if (this.live || this.busy) return;
    this.setAutoPlay(false);
    this.replaying = d;
    this.replayDone = false;
    this.board = minesBoard(d.bombs, { run: d.run, round: d.round });
    this.dug = {};
    this.found = [];
    this.ended = null;
    this.shown = false;
    const board = this.board;
    for (const i of d.digs) {
      if (!(await this.seq.wait(REPLAY_DIG_MS)) || this.replaying !== d) return;
      const tile = board[i]!;
      this.dug = { ...this.dug, [i]: tile };
      if (tile === 'star' || tile === 'cart') sfx.bigWin();
      else sfx.coin(Object.keys(this.dug).length);
    }
    if (!(await this.seq.wait(REPLAY_DIG_MS)) || this.replaying !== d) return;
    this.ended = { how: 'cashed', at: -1, pay: new Decimal(d.bet).mul(d.pay) };
    this.shown = true;
    sfx.win();
    // The replay holds here, the whole board shown, until the player moves on.
    this.replayDone = true;
  }

  /** Puts a finished replay away; the board stays as it is until the next round deals a new one. */
  closeReplay() {
    if (!this.replaying || !this.replayDone) return;
    this.replaying = null;
    this.replayDone = false;
  }

  /** Squares on the vault's board still to pick. */
  bonusFree(): number[] {
    return Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => !this.bonus?.picked.includes(i));
  }

  /** What the vault's board has found so far, as a share of the vault. */
  get bonusShare(): number {
    return this.bonus ? this.bonus.picked.reduce((sum, i) => sum + (this.bonus!.squares[i]! || 0), 0) : 0;
  }

  /** Opens a square on the vault's bonus board. */
  openSquare(i: number) {
    const b = this.bonus;
    if (!b || b.done || b.picked.includes(i) || this.asking) return;
    void this.move({ type: 'mines.open', square: i });
  }

  /** The vault pays its share and empties; the round that filled it settles with it. */
  closeBonus() {
    const b = this.bonus;
    if (!b?.done) return;
    this.bonus = null;
    const s = this.settling;
    this.settling = null;
    if (s) this.count(s.round, s.hold);
    this.resumeWaiting();
  }

  /**
   * Auto play: rounds asked for a few at a time, each digging `autoDigs`
   * squares at random, then cashing out; rides and vaults play themselves. The
   * engine plays them through, and the board shows each move in turn.
   */
  private async runAuto() {
    while (this.autoPlay && !this.seq.disposed) {
      // A round left in play by hand, or a ride or vault waiting: finish it first, at random.
      while (this.live || this.ride || this.bonus || this.asking) {
        if (!(await this.seq.wait(AUTO_DIG_MS)) || !this.autoPlay) return;
        if (this.live && !this.ride && !this.bonus && this.found.length >= this.autoDigs) this.cashOut();
        else this.digRandom();
      }
      if (!this.canBet) {
        this.autoPlay = false;
        return;
      }
      const s = autoplay.settings;
      const left = s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH;
      const stop = { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined };
      if (!(await this.showBatch(Math.min(AUTO_BATCH, left), stop))) {
        this.autoPlay = false;
        return;
      }
    }
  }

  /** Asks for whole rounds and shows them move by move. */
  private async showBatch(rounds: number, stop: { winX?: number; below?: string; above?: string }): Promise<boolean> {
    const before = player.shown.floor.best;
    const vaultBefore = minesProgress(player.shown).vault;
    let decided: { steps: MinesStep[]; rounds: MinesRound[] } = { steps: [], rounds: [] };
    let holds: number[] = [];
    this.asking = true;
    const out = await playOrAuto(true, 'mines', { type: 'mines.auto', bombs: this.bombs, digs: this.autoDigs, step: this.step, room: floor.current, rounds, stop }, SPEED[this.seq.speed] ?? 1, (landed) => {
      decided = landed.result && 'steps' in landed.result ? landed.result : decided;
      holds = player.holdBack(decided.rounds, before);
      player.view('mines', { ...minesProgress(player.truth), vault: vaultBefore, live: null });
    });
    this.asking = false;
    if (!out.ok) {
      this.error = out.error;
      return false;
    }
    this.error = null;
    this.showing = true;
    let n = -1;
    try {
      for (const step of decided.steps) {
        if (step.kind === 'begin') {
          // The round before has been shown: it settles on screen, then the next one deals.
          if (n >= 0) {
            this.finishShown(decided.rounds[n]!, holds[n]!);
            if (!(await this.seq.wait(AUTO_NEXT_MS))) return false;
          }
          n++;
          player.start(holds[n]!, decided.rounds[n]!);
        } else if (!(await this.seq.wait(AUTO_DIG_MS))) return false;
        this.show(step);
        if (step.kind === 'cash' || (step.kind === 'dig' && step.tile === 'bomb')) {
          if (decided.rounds[n]?.vault && !this.bonus) this.bonus = { squares: Array<number>(MINES_TILES).fill(NaN), picked: [], cash: new Decimal(decided.rounds[n]!.vault!.cash), done: false };
        }
        if (step.kind === 'track' && step.done) {
          if (!(await this.seq.wait(AUTO_DIG_MS * 2))) return false;
          this.ride = null;
        }
      }
      if (n >= 0) this.finishShown(decided.rounds[n]!, holds[n]!);
      if (!(await this.seq.wait(AUTO_NEXT_MS))) return false;
      return true;
    } finally {
      this.showing = false;
      player.reveal(...holds);
      player.view('mines', null);
      this.syncVault();
    }
  }

  /** A round auto play has shown: its board and result; a vault board shown closes on its own. */
  private finishShown(r: MinesRound, hold: number) {
    this.bonus = null;
    this.settling = null;
    this.board = r.board;
    this.ended = { how: r.how, at: r.at, pay: new Decimal(r.bet).mul(r.pay) };
    this.live = null;
    this.shown = true;
    this.count(r, hold);
  }

  setAutoPlay(on: boolean) {
    const was = this.autoPlay;
    this.autoPlay = on && this.started && !this.gameOver;
    if (this.autoPlay && !was) void this.runAuto();
  }

  /** What the cash-out button says. */
  get cashLabel(): string {
    return this.live && this.found.length ? `Cash out ${formatMoney(this.live.bet.mul(this.cashout))}` : 'Cash out';
  }
}
