import type { HandEval } from './evaluate';
import { lookupScale, type ScaleTable } from './paytables';

export type SideBetMetric = 'flushSize' | 'straightFlush';

export interface SideBetDef {
  id: string;
  name: string;
  metric: SideBetMetric;
  /** Pays N:1 by metric value; 0 means the bet loses. */
  pays: ScaleTable;
  /** House edge on a standard deck, as published; the audit holds the simulator to it. */
  edge: number;
}

export type SideBetOwner = 'player' | 'dealer' | 'none';

export function sideBetMetric(def: SideBetDef, hand: HandEval): number {
  switch (def.metric) {
    case 'flushSize':
      return hand.size;
    case 'straightFlush':
      return hand.straightFlush;
  }
}

/** The N in "pays N:1" for this hand, or 0 on a miss. */
export function sideBetPays(def: SideBetDef, hand: HandEval): number {
  return lookupScale(def.pays, sideBetMetric(def, hand));
}

/** I Luv Suits' Flush Rush, Wizard of Odds pay table (7.53%). */
export const FLUSH_RUSH: SideBetDef = {
  id: 'flushRush',
  name: 'Flush Rush',
  metric: 'flushSize',
  pays: { values: { 4: 2, 5: 5, 6: 75, 7: 300 }, extrapolateFactor: 10, below: 0 },
  edge: 0.075292,
};

/**
 * I Luv Suits' Super Flush Rush, Wizard of Odds pay table. Wizard quotes 13.11%
 * from straight-flush counts 124 hands short of its own progressive table;
 * counted exactly, it is 13.09%.
 */
export const SUPER_FLUSH_RUSH: SideBetDef = {
  id: 'superFlushRush',
  name: 'Super Flush Rush',
  metric: 'straightFlush',
  pays: { values: { 3: 7, 4: 60, 5: 100, 6: 1000, 7: 8000 }, extrapolateFactor: 10, below: 0 },
  edge: 17507564 / 133784560,
};
