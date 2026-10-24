/**
 * One line on why a showdown went the way it did, from two named, scored hands:
 * "Pair of queens beats pair of jacks", or when both make the same hand, who
 * had the better kicker.
 */
export function showdownLine(you: { name: string; score: number }, them: { name: string; score: number }): string {
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  you = { ...you, name: fullRanks(you.name) };
  them = { ...them, name: fullRanks(them.name) };
  if (you.score === them.score) return `Both have ${lower(you.name)}: a tie`;
  const same = you.name === them.name;
  if (you.score > them.score) return same ? `${you.name} each · your kicker plays` : `${you.name} beats ${lower(them.name)}`;
  return same ? `${them.name} each · the dealer's kicker plays` : `${them.name} beats ${lower(you.name)}`;
}

const RANK_WORDS: Record<string, string> = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

/** "K high" reads as "King high". */
function fullRanks(name: string): string {
  return name.replace(/^([JQKA]) high$/, (_, r: string) => `${RANK_WORDS[r]} high`);
}

/** A hand's name mid-sentence: "You folded queen high", "The dealer had pair of 10s". */
export function handPhrase(name: string): string {
  const full = fullRanks(name);
  return full.charAt(0).toLowerCase() + full.slice(1);
}
