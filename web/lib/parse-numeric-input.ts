/** Full-width ASCII digit pairs (Unicode fullwidth 0–9). */
const FW_DIGITS = "０１２３４５６７８９";

/**
 * Trim, strip commas, remove spaces, map full-width digits to ASCII.
 * Does not parse — use `parseNonNegativeNumber` for validation.
 */
export function normalizeNumericString(raw: string): string {
  let s = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  for (let i = 0; i <= 9; i++) {
    s = s.split(FW_DIGITS[i]).join(String(i));
  }
  return s;
}

export type ParseNonNegResult =
  | { ok: true; value: number }
  | { ok: false; empty: true }
  | { ok: false; empty: false };

/**
 * Parse a non-negative number after normalization.
 * Empty after normalize → `{ ok: false, empty: true }`.
 */
export function parseNonNegativeNumber(raw: string): ParseNonNegResult {
  const s = normalizeNumericString(raw);
  if (s === "") return { ok: false, empty: true };
  const parsed = Number(s);
  if (Number.isNaN(parsed) || parsed < 0) return { ok: false, empty: false };
  return { ok: true, value: parsed };
}
