import type { Platform } from "@/lib/types";
import type { ParsedCreatorUrl } from "./types";

const HANDLE_RE = /^[a-zA-Z0-9._]{1,64}$/;

function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle) && handle !== "explore" && handle !== "accounts";
}

function normalizeInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (t.includes(".") && !t.includes(" ")) return `https://${t}`;
  return t;
}

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function parseInstagram(url: URL): ParsedCreatorUrl | null {
  if (!hostMatches(url.hostname, "instagram.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const head = parts[0].toLowerCase();
  const blocked = new Set([
    "p",
    "reel",
    "reels",
    "stories",
    "tv",
    "explore",
    "accounts",
    "direct",
    "about",
  ]);
  if (blocked.has(head)) return null;
  const handle = parts[0];
  if (!isValidHandle(handle)) return null;
  return {
    platform: "Instagram",
    handle,
    normalizedUrl: `https://www.instagram.com/${handle}/`,
  };
}

function parseTikTok(url: URL): ParsedCreatorUrl | null {
  if (!hostMatches(url.hostname, "tiktok.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => p.toLowerCase() === "video")) return null;
  const at = parts.find((p) => p.startsWith("@"));
  if (at) {
    const handle = at.slice(1);
    if (!isValidHandle(handle)) return null;
    return {
      platform: "TikTok",
      handle,
      normalizedUrl: `https://www.tiktok.com/@${handle}`,
    };
  }
  if (parts[0].startsWith("@")) {
    const handle = parts[0].slice(1);
    if (!isValidHandle(handle)) return null;
    return {
      platform: "TikTok",
      handle,
      normalizedUrl: `https://www.tiktok.com/@${handle}`,
    };
  }
  return null;
}

function parseYouTube(url: URL): ParsedCreatorUrl | null {
  if (!hostMatches(url.hostname, "youtube.com") && !hostMatches(url.hostname, "youtu.be")) {
    return null;
  }
  if (hostMatches(url.hostname, "youtu.be")) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const headLower = parts[0].toLowerCase();
  if (
    headLower === "watch" ||
    headLower === "shorts" ||
    headLower === "live" ||
    headLower === "playlist"
  ) {
    return null;
  }

  if (parts[0].startsWith("@")) {
    const handle = parts[0].slice(1);
    if (!isValidHandle(handle)) return null;
    return {
      platform: "YouTube",
      handle,
      normalizedUrl: `https://www.youtube.com/@${handle}`,
    };
  }

  if (
    (headLower === "channel" || headLower === "c" || headLower === "user") &&
    parts[1] &&
    !parts[1].includes(" ")
  ) {
    const handle = parts[1];
    return {
      platform: "YouTube",
      handle,
      normalizedUrl: `https://www.youtube.com/${headLower}/${handle}`,
    };
  }

  return null;
}

function parseTwitter(url: URL): ParsedCreatorUrl | null {
  const ok =
    hostMatches(url.hostname, "twitter.com") || hostMatches(url.hostname, "x.com");
  if (!ok) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const head = parts[0].toLowerCase();
  const blocked = new Set([
    "home",
    "explore",
    "notifications",
    "messages",
    "i",
    "intent",
    "share",
    "search",
    "settings",
    "compose",
  ]);
  if (blocked.has(head) || head === "status") return null;
  if (parts.length >= 2 && parts[1].toLowerCase() === "status") return null;

  const handle = parts[0];
  if (!isValidHandle(handle)) return null;
  return {
    platform: "X / Twitter",
    handle,
    normalizedUrl: `https://x.com/${handle}`,
  };
}

function parseXiaohongshu(url: URL): ParsedCreatorUrl | null {
  if (
    !hostMatches(url.hostname, "xiaohongshu.com") &&
    !hostMatches(url.hostname, "xhslink.com")
  ) {
    return null;
  }

  if (hostMatches(url.hostname, "xhslink.com")) {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const profileIdx = parts.findIndex((p) => p.toLowerCase() === "profile");
  if (profileIdx >= 0 && parts[profileIdx + 1]) {
    const handle = parts[profileIdx + 1];
    if (handle.length < 4 || handle.length > 64) return null;
    return {
      platform: "Xiaohongshu / RED",
      handle,
      normalizedUrl: `https://www.xiaohongshu.com/user/profile/${handle}`,
    };
  }

  if (parts[0]?.toLowerCase() === "user" && parts[1]?.toLowerCase() === "profile" && parts[2]) {
    return {
      platform: "Xiaohongshu / RED",
      handle: parts[2],
      normalizedUrl: `https://www.xiaohongshu.com/user/profile/${parts[2]}`,
    };
  }

  return null;
}

/**
 * Parse a public creator profile URL. No network calls.
 * Returns null when the URL is unsupported, a post/video link, or invalid.
 */
export function parseCreatorProfileUrl(raw: string): ParsedCreatorUrl | null {
  const normalized = normalizeInput(raw);
  if (!normalized) return null;

  const url = tryParseUrl(normalized);
  if (!url) return null;

  const parsers = [
    parseInstagram,
    parseTikTok,
    parseYouTube,
    parseTwitter,
    parseXiaohongshu,
  ];

  for (const parse of parsers) {
    const result = parse(url);
    if (result) return result;
  }

  return null;
}

export function defaultIntakeNudge(): import("./types").IntakeNudge[] {
  return ["profile", "recent_post"];
}
