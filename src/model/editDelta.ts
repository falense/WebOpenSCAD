/**
 * Write-back rules for direct manipulation (viewport drags).
 *
 * A drag produces a numeric delta that must be folded into an expression
 * field without destroying parametric intent: plain numbers are replaced,
 * anything else keeps the expression and appends "+ delta". A trailing
 * numeric term from a previous drag is merged so repeated drags don't
 * accumulate into chains like "w / 2 + 3 + 2 - 1".
 */

const NUM_LITERAL = /^-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?$/;

/** Trailing "± <number>" term, e.g. the "+ 12.5" in "width / 2 + 12.5". */
const TRAILING_TERM = /^(.*[^+\-*/%^(,\s])\s*([+-])\s*([0-9]*\.?[0-9]+)$/;

export function isNumericLiteral(src: string): boolean {
  return NUM_LITERAL.test(src.trim());
}

/** Format a number for an expression field: round to 2 decimals, no float junk. */
export function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100;
  // Avoid "-0"
  return (Object.is(r, -0) ? 0 : r).toString();
}

/**
 * Apply a drag delta to an expression string.
 *  - "12"          + 2.5 -> "14.5"
 *  - "w / 2"       + 2.5 -> "w / 2 + 2.5"
 *  - "w / 2 + 1"   + 2.5 -> "w / 2 + 3.5"   (trailing term merged)
 *  - "w / 2 + 1"   - 1   -> "w / 2"
 */
export function applyDelta(expr: string, delta: number): string {
  const s = expr.trim();
  if (Math.abs(delta) < 1e-9) return s;
  if (isNumericLiteral(s)) return fmtNum(parseFloat(s) + delta);

  const m = TRAILING_TERM.exec(s);
  if (m) {
    const base = m[1].trim();
    const tail = (m[2] === "-" ? -1 : 1) * parseFloat(m[3]);
    const sum = Math.round((tail + delta) * 100) / 100;
    if (sum === 0) return base;
    return `${base} ${sum >= 0 ? "+" : "-"} ${fmtNum(Math.abs(sum))}`;
  }

  return `${s} ${delta >= 0 ? "+" : "-"} ${fmtNum(Math.abs(delta))}`;
}
