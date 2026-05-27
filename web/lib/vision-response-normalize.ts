import type { PerImagePostMetricsInput } from "./recent-post-aggregate";

/** Normalize OpenAI `per_image` — may be array, keyed object, or single object. */
export function normalizePerImageArray(value: unknown): PerImagePostMetricsInput[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is PerImagePostMetricsInput =>
        item !== null && typeof item === "object" && !Array.isArray(item)
    );
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const values = Object.values(obj).filter(
      (item): item is PerImagePostMetricsInput =>
        item !== null && typeof item === "object" && !Array.isArray(item)
    );
    if (values.length > 0) return values;
    return [obj as PerImagePostMetricsInput];
  }
  return [];
}

/** Normalize string lists that may arrive as a single string. */
export function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function describeValueShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return `object(${Object.keys(value as object).join(",")})`;
  return typeof value;
}
