import { describe, expect, it } from "vitest";
import { buildReport } from "./scoring";
import { campaignFitFromReport } from "./campaign-fit";

describe("decision layer — mega reach", () => {
  it("scores large creators with strong views as watchlist / medium band", () => {
    const report = buildReport({
      name: "@mega_beauty",
      platform: "Instagram",
      niche: "Beauty",
      followers: 1_900_000,
      avgViews: 400_000,
      averageLikes: 12_000,
      averageComments: 800,
      brandCategory: "beauty",
      campaignGoal: "Awareness",
      comments: [
        "link please",
        "where is this lipstick from",
        "makeup please",
        "need this look",
        "so pretty",
      ],
    });

    expect(report.decision).not.toBe("Not Recommended");
    expect(report.overallScore).toBeGreaterThanOrEqual(58);
    expect(report.overallScore).toBeLessThanOrEqual(85);
    expect(report.pillarScores.reach).toBeGreaterThanOrEqual(80);
    expect(["Awareness", "Distribution", "BrandFit"]).toContain(
      report.recommendedRole
    );
    expect(report.engagement.label).not.toBe("Weak");
    expect(["Medium", "High"]).toContain(campaignFitFromReport(report));
    expect(report.gap.label).not.toBe("High traffic, weak monetization");
  });
});
