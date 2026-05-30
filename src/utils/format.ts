/**
 * Formatting helpers shared across screens.
 */

/**
 * Format a 0–1 fraction as a percentage string.
 *
 * Shows up to one decimal place, dropping a trailing ".0" so whole
 * percentages stay clean. Negative values keep their sign.
 *
 *   formatPct(0.85)   → "85%"
 *   formatPct(0.125)  → "12.5%"
 *   formatPct(0)      → "0%"
 *   formatPct(-0.05)  → "-5%"
 *
 * The backend emits accuracy, weekly delta, and life-list percentage all as
 * fractions 0–1, so this is the single place that converts them for display.
 */
export function formatPct(fraction: number): string {
  const pct = (fraction ?? 0) * 100;
  // Round to one decimal, then drop a trailing ".0" for whole numbers.
  const rounded = Math.round(pct * 10) / 10;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${str}%`;
}
