import { describe, expect, it } from "vitest";
import { intakeProfileToAnalyzeHints, mockIntakeProfile } from "./to-analyze-payload";

describe("intakeProfileToAnalyzeHints", () => {
  it("maps mock profile to analyze payload shape", () => {
    const profile = mockIntakeProfile(
      "Instagram",
      "somecreator",
      "https://www.instagram.com/somecreator/"
    );
    const hints = intakeProfileToAnalyzeHints(profile);

    expect(hints.name).toBe("somecreator");
    expect(hints.creatorHandle).toBe("somecreator");
    expect(hints.platform).toBe("Instagram");
    expect(hints.detectedPlatform).toBe("Instagram");
    expect(hints.platformConfidence).toBe("low");
    expect(hints.followers).toBeUndefined();
    expect(hints.avgViews).toBeUndefined();
    expect(hints.comments).toBeUndefined();
  });

  it("strips leading @ from handle", () => {
    const profile = mockIntakeProfile(
      "TikTok",
      "@creator",
      "https://www.tiktok.com/@creator"
    );
    const hints = intakeProfileToAnalyzeHints(profile);
    expect(hints.name).toBe("creator");
    expect(hints.creatorHandle).toBe("creator");
  });
});
