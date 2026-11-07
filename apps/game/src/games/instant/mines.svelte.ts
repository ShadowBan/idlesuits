import {
  CART_BOOSTS,
  cartMultiplier,
  cartRide,
  CART_TRACKS,
  minesBoard,
  minesState,
  MINES_MAX_BOMBS,
  MINES_TILES,
  Rng,
  vaultBoard,
  VAULT_FULL,
  VAULT_PICKS,
  type MinesFind,
  type MinesTile,
} from '@idlesuits/sim';
import { Decimal, formatMoney } from '../../lib/money';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Milliseconds at 1×: between auto play's digs, and before its next round. */
const AUTO_DIG_MS = 420;
const AUTO_NEXT_MS = 1200;
/** The square that decided a round holds the eye this long before the rest of the board is shown. */
const REVEAL_MS = 650;

/** A cart ride in progress: the cave-ins (hidden), the tracks taken, and what it has added so far. */
export interface CartRide {
  caves: number[];
  picks: number[];
  x: number;
  /** Caved in on the last pick. */
  caved: boolean;
  done: boolean;
}

/** The vault's bonus board in play: the shares under its squares (hidden till picked), and the picks. */
export interface VaultBonus {
  squares: number[];
  picked: number[];
  /** The vault's cash it pays a share of. */
  cash: Decimal;
  done: boolean;
}

/**
 * Dynamite Dig: Mines. The player buries 1–24 sticks of dynamite in 25
 * squares, stakes the bet and digs. Gems and stars raise the cash-out (see
 * `minesState`), a mine cart takes a ride that multiplies it, and dynamite
 * loses the bet. Every find also drops cash in the Gem Vault, which carries
 * over between rounds and, once full, opens a free bonus board after the round.
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
  /** The round in play: its seed number and stake. */
  live = $state<{ round: number; bet: Decimal } | null>(null);
  /** How the last round ended: on dynamite (at its square) or cashed out, and what it paid. */
  ended = $state<{ how: 'boom' | 'cashed'; at: number; pay: Decimal } | null>(null);
  board = $state<MinesTile[] | null>(null);
  /** The whole board is showing, after a round. */
  shown = $state(false);
  /** A cart ride under way. */
  ride = $state<CartRide | null>(null);
  /** The Gem Vault: cash set aside by every find, and the finds toward opening it. Saved. */
  vaultCash = $state(new Decimal(0));
  vaultFinds = $state(0);
  /** The vault's bonus board, after the round that filled it. */
  bonus = $state<VaultBonus | null>(null);
  /** Counts finds, so the vault can pulse as cash drops in. */
  drops = $state(0);
  private pick: Rng;
  /** A finished round waiting on the vault's bonus before it settles. */
  private pending: { round: number; bet: Decimal; pay: number; text: string; sub: string } | null = null;

  constructor() {
    super('mines');
    const bombs = load<number>('mines.bombs', 3);
    this.bombs = Number.isInteger(bombs) && bombs >= 1 && bombs <= MINES_MAX_BOMBS ? bombs : 3;
    const autoDigs = load<number>('mines.autoDigs', 3);
    this.autoDigs = Number.isInteger(autoDigs) && autoDigs >= 1 ? Math.min(autoDigs, MINES_TILES - this.bombs) : 3;
    const vault = load<{ cash: string; finds: number }>('mines.vault', { cash: '0', finds: 0 });
    try {
      this.vaultCash = new Decimal(vault.cash).max(0);
      this.vaultFinds = Math.min(VAULT_FULL, Math.max(0, Math.floor(vault.finds) || 0));
    } catch {
      this.vaultCash = new Decimal(0);
    }
    this.pick = new Rng(this.runSeed, 'mines-pick');
  }

  setBombs(n: number) {
    if (this.live) return;
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
    return minesState(this.bombs, this.found, this.rtp);
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

  /** Nothing is waiting on the player but the next dig or a new round. */
  get busy(): boolean {
    return this.ride !== null || this.bonus !== null;
  }

  /** Stakes the bet and deals a fresh board. */
  begin(): boolean {
    if (this.live || this.busy) return false;
    const s = this.stake();
    if (!s) return false;
    this.live = s;
    this.board = minesBoard(this.bombs, { run: this.runSeed, round: s.round });
    this.dug = {};
    this.found = [];
    this.ended = null;
    this.shown = false;
    sfx.chip();
    return true;
  }

  /** Digs a square; with no round on, a dig starts one and digs it. */
  dig(i: number) {
    if (this.busy) return;
    if (!this.live && !this.begin()) return;
    if (!this.board || this.dug[i] !== undefined) return;
    const tile = this.board[i]!;
    this.dug[i] = tile;
    if (tile === 'bomb') {
      sfx.lose();
      this.finish('boom', i, 0);
      return;
    }
    this.dropInVault();
    if (tile === 'cart') {
      // The cart rolls: the round waits on its ride.
      sfx.spin();
      this.ride = { caves: cartRide({ run: this.runSeed, round: this.live!.round }), picks: [], x: 1, caved: false, done: false };
      return;
    }
    this.found = [...this.found, { tile }];
    if (tile === 'star') sfx.bigWin();
    else sfx.coin(this.found.length);
    if (this.safeLeft === 0) this.cashOut();
  }

  /** Every find drops a share of the bet into the vault. */
  private dropInVault() {
    const bet = this.live!.bet;
    this.vaultCash = this.vaultCash.add(bet.mul(this.state.vault));
    this.vaultFinds = Math.min(VAULT_FULL, this.vaultFinds + 1);
    this.drops++;
    save('mines.vault', { cash: this.vaultCash.toString(), finds: this.vaultFinds });
  }

  /** The cart takes a track at its junction: a cave-in ends the ride; a clear one adds its boost. */
  takeTrack(track: number) {
    const ride = this.ride;
    if (!ride || ride.done || track < 0 || track >= CART_TRACKS) return;
    ride.picks = [...ride.picks, track];
    ride.x = cartMultiplier(ride.caves, ride.picks);
    ride.caved = ride.caves[ride.picks.length - 1] === track;
    ride.done = ride.caved || ride.picks.length === CART_BOOSTS.length;
    if (ride.caved) sfx.lose();
    else sfx.coin(ride.picks.length * 2);
  }

  /** The ride is over: its multiplier goes on the cash-out, and digging resumes. */
  endRide() {
    const ride = this.ride;
    if (!ride?.done || !this.live) return;
    this.ride = null;
    this.found = [...this.found, { tile: 'cart', cart: ride.x }];
    sfx.win();
    if (this.safeLeft === 0) this.cashOut();
  }

  /** Digs a square at random (or, mid-ride, takes a track at random). */
  digRandom() {
    if (this.ride) {
      if (this.ride.done) this.endRide();
      else this.takeTrack(this.pick.int(CART_TRACKS));
      return;
    }
    if (this.bonus) {
      if (this.bonus.done) this.closeBonus();
      else this.openSquare(this.bonusFree()[this.pick.int(this.bonusFree().length)]!);
      return;
    }
    if (!this.live) return;
    const open = Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => this.dug[i] === undefined);
    this.dig(open[this.pick.int(open.length)]!);
  }

  cashOut() {
    if (!this.live || !this.found.length || this.busy) return;
    const pay = this.cashout;
    sfx.win();
    this.finish('cashed', -1, pay);
  }

  private finish(how: 'boom' | 'cashed', at: number, pay: number) {
    const { round, bet } = this.live!;
    const finds = this.found.length;
    const stars = this.found.filter((f) => f.tile === 'star').length;
    const carts = this.found.filter((f) => f.tile === 'cart');
    this.live = null;
    this.ended = { how, at, pay: bet.mul(pay) };
    const sticks = `${this.bombs} ${this.bombs === 1 ? 'stick' : 'sticks'}`;
    const text = how === 'boom' ? 'Dynamite' : `Cashed out ${pay.toFixed(2)}×`;
    const extras = [stars ? `${stars} ${stars === 1 ? 'star' : 'stars'}` : '', ...carts.map((c) => `cart ×${c.cart}`)].filter(Boolean);
    const sub = [`${finds} ${finds === 1 ? 'find' : 'finds'}`, ...extras, sticks].join(' · ');
    // A moment on the square that decided it, then the rest of the board: this round's board only.
    const board = this.board;
    setTimeout(() => {
      if (this.board === board) this.shown = true;
    }, REVEAL_MS);
    // A full vault opens its bonus board before the round settles.
    if (this.vaultFinds >= VAULT_FULL) {
      this.pending = { round, bet, pay, text, sub };
      this.bonus = { squares: vaultBoard({ run: this.runSeed, round }), picked: [], cash: this.vaultCash, done: false };
      setTimeout(() => sfx.bigWin(), REVEAL_MS);
      return;
    }
    this.settle(round, bet, pay, text, sub, this.linesFor(pay, finds));
  }

  private linesFor(pay: number, finds: number) {
    return pay > 0 ? [{ label: `Cash-out · ${finds} ${finds === 1 ? 'find' : 'finds'}, ${pay.toFixed(2)}×`, amount: pay }] : [];
  }

  /** Squares on the vault's board still to pick. */
  bonusFree(): number[] {
    return Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => !this.bonus?.picked.includes(i));
  }

  /** What the vault's board has found so far, as a share of the vault. */
  get bonusShare(): number {
    return this.bonus ? this.bonus.picked.reduce((sum, i) => sum + this.bonus!.squares[i]!, 0) : 0;
  }

  /** Opens a square on the vault's bonus board. */
  openSquare(i: number) {
    const b = this.bonus;
    if (!b || b.done || b.picked.includes(i)) return;
    b.picked = [...b.picked, i];
    sfx.coin(b.picked.length * 2);
    if (b.picked.length >= VAULT_PICKS) {
      b.done = true;
      sfx.bigWin();
    }
  }

  /** The vault pays its share and empties; the round that filled it settles with it. */
  closeBonus() {
    const b = this.bonus;
    const p = this.pending;
    if (!b?.done || !p) return;
    const won = b.cash.mul(this.bonusShare);
    this.bonus = null;
    this.pending = null;
    this.vaultCash = new Decimal(0);
    this.vaultFinds = 0;
    save('mines.vault', { cash: '0', finds: 0 });
    const vaultBets = won.div(p.bet).toNumber();
    const lines = [...this.linesFor(p.pay, this.found.length), { label: `Gem Vault · ${(this.bonusShare * 100).toFixed(0)}% of ${formatMoney(b.cash)}`, amount: vaultBets }];
    this.settle(p.round, p.bet, p.pay + vaultBets, `${p.text} + Gem Vault`, p.sub, lines);
  }

  /** Auto play: a round at a time, digging `autoDigs` squares at random, then cashing out; rides and vaults play themselves. */
  private async runAuto() {
    while (this.autoPlay && !this.seq.disposed) {
      while (this.busy) {
        if (!(await this.seq.wait(AUTO_DIG_MS)) || !this.autoPlay) return;
        this.digRandom();
      }
      if (!this.live && !this.begin()) {
        this.autoPlay = false;
        return;
      }
      while ((this.live && this.found.length < this.autoDigs) || this.busy) {
        if (!(await this.seq.wait(AUTO_DIG_MS)) || !this.autoPlay) return;
        this.digRandom();
      }
      if (this.live) this.cashOut();
      if (!(await this.seq.wait(AUTO_NEXT_MS))) return;
    }
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
