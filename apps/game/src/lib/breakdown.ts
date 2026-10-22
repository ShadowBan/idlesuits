/** One line of a payout explanation: a label and an amount in bet units. */
export interface BreakdownLine {
  label: string;
  /** In antes, or whatever unit the game stakes in. */
  amount: number;
}
