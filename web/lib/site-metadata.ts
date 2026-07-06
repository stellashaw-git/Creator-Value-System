import { SITE_URL } from "./site-url";

export const SITE_NAME = "WorthyIQ";

export const SITE_TITLE = "WorthyIQ | Creator Intelligence Platform";

export const SITE_DESCRIPTION =
  "WorthyIQ helps brands and agencies evaluate creators with AI-powered creator intelligence, monetization signals, and campaign-fit insights.";

export const OG_IMAGE_PATH = "/og-image.png";

export const OG_IMAGE_ALT =
  "WorthyIQ — Creator Intelligence Platform for brands and agencies";

export const OG_IMAGE_WIDTH = 1200;

export const OG_IMAGE_HEIGHT = 630;

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  logo: `${SITE_URL}${OG_IMAGE_PATH}`,
} as const;

/** Static public App Router pages suitable for indexing (no auth, API, dev, or dynamic IDs). */
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/analyze",
  "/compare",
  "/waitlist",
  "/saved",
] as const;
