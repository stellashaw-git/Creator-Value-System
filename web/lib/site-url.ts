/** Canonical production origin for metadata routes (sitemap, robots). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://worthyiq.com";
