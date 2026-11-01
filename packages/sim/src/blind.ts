import type { C4pChoice, C4pDecision } from './c4p';
import type { CspMove } from './csp';
import type { DjMove } from './djw';
import type { LirMove } from './lir';
import type { PaiGowDecision, PaiGowSet } from './paigow';
import type { StudChoice, StudDecision } from './stud';
import type { TcpMove } from './tcp';
import type { UthDecision, UthMove } from './uth';

/**
 * How a blind hand plays: unseen, so all in. It never folds or pulls a bet
 * back and always makes the biggest raise the rules allow. Worse than the
 * strategy, which is the price of playing hands you can't look at.
 */
export const BLIND = {
  tcp: (): TcpMove => 'play',
  uth: (d: UthDecision): { move: UthMove; raise?: number } =>
    d.raises.length ? { move: 'raise', raise: Math.max(...d.raises) } : { move: 'check' },
  stud: (d: StudDecision): StudChoice => ({ move: 'bet', size: Math.max(...d.raises) }),
  lir: (): LirMove => 'ride',
  csp: (): CspMove => 'raise',
  c4p: (d: C4pDecision): C4pChoice => ({ move: 'play', size: Math.max(...d.sizes) }),
  djw: (): DjMove => 'play',
  // Nothing to bet: a blind Pai Gow hand is set the house way, as a dealer sets an absent player's.
  paigow: (d: PaiGowDecision): PaiGowSet => d.suggestion,
};
