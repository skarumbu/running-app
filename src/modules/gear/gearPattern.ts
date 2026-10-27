import { comfortOf } from '../../lib/feel';
import type { Gear } from '../../lib/runTypes';

/** A pattern needs at least this many rated runs on one item to say anything. */
export const MIN_RATED_RUNS = 3;

/**
 * One line about the comfiest active gear, or null when no item has enough
 * rated runs to call it a pattern.
 */
export function gearPattern(gear: Gear[]): string | null {
  const rated = gear.filter(g => !g.retired && g.avg_comfort != null && g.rated_count >= MIN_RATED_RUNS);
  if (rated.length === 0) return null;
  const best = rated.reduce((a, b) => (b.avg_comfort! > a.avg_comfort! ? b : a));
  return `${best.name} is your comfiest: it usually ${comfortOf(best.avg_comfort)!.phrase} across ${best.rated_count} rated runs.`;
}
