/**
 * Filters OCR / vision lines so comment fields only receive real comment text,
 * not view counts, likes, or other numeric UI chrome.
 */

import { coerceMetricCount } from "./extract";

/** Bare count tokens (49.9M, 32.2K, 1,234) — not comment text. */
export function isMetricOnlyOcrLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^[\d,.]+\s*[kmb]?$/i.test(t.replace(/\s/g, ""))) return true;
  if (
    /^[\d,.]+\s*([kmb])?\s*(views?|plays?|likes?|followers?|following|reposts?|shares?|saves?)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\bviews?\s*[:\-]?\s*[\d,.]+\s*([kmb])?\b/i.test(t)) return true;
  if (/\bfollowers?\s*[:\-]?\s*[\d,.]+\s*([kmb])?\b/i.test(t)) return true;
  return false;
}

/** Reels/post engagement lines (e.g. "180K heart", "181 comments") — not user comments. */
export function isPostEngagementOcrLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isMetricOnlyOcrLine(t)) return true;
  if (
    /^[\d,.]+\s*([kmb])?\s*(heart|hearts?|likes?|comments?|views?|shares?|saves?|reposts?|send)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^[\d,.]+\s*([kmb])?\s+\w{3,12}$/i.test(t) && /\b(heart|hearts?|likes?|comments?)\b/i.test(t)) {
    return true;
  }
  if (/^(heart|like|comment|share|save|repost)\s*[\d,.]+\s*([kmb])?$/i.test(t)) {
    return true;
  }
  return false;
}

/** True when the line could be a user-written comment (letters, emoji, short phrases). */
export function isValidCommentTextLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 2) return false;
  if (isMetricOnlyOcrLine(t)) return false;
  if (isPostEngagementOcrLine(t)) return false;

  const n = coerceMetricCount(t);
  if (n !== null && !/[a-zA-Z\u00C0-\u024F]/.test(t) && t.length <= 12) {
    return false;
  }

  if (/^@?[a-zA-Z0-9._]{1,32}$/.test(t) && !/\s/.test(t)) return false;
  if (/^(reply|replies|view|views|like|likes|share|shares|more|see translation)$/i.test(t)) {
    return false;
  }

  return /[a-zA-Z\u00C0-\u024F]/.test(t) || /[\u{1F300}-\u{1FAFF}]/u.test(t) || /\?|!/.test(t);
}

export function filterCommentLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const t = line.trim();
    if (!isValidCommentTextLine(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
