import { describe, expect, it } from "vitest";
import {
  analyzeCommentSample,
  classifyCommentIntent,
  commercialSignalPct,
} from "./comment-intent";

describe("classifyCommentIntent", () => {
  it("classifies strong purchase intent", () => {
    expect(classifyCommentIntent("link?")).toBe("purchase");
    expect(classifyCommentIntent("how much is this")).toBe("purchase");
    expect(classifyCommentIntent("what brand is this")).toBe("purchase");
  });

  it("classifies product curiosity (not passive)", () => {
    expect(classifyCommentIntent("where is this dress from?")).toBe(
      "product_curiosity"
    );
    expect(classifyCommentIntent("what shoes are these?")).toBe("product_curiosity");
    expect(classifyCommentIntent("is this from Zara?")).toBe("product_curiosity");
  });

  it("classifies style replication intent", () => {
    expect(classifyCommentIntent("I need to recreate this")).toBe("style_replication");
    expect(classifyCommentIntent("saving this outfit")).toBe("style_replication");
  });

  it("classifies passive admiration", () => {
    expect(classifyCommentIntent("so cute")).toBe("passive");
    expect(classifyCommentIntent("queen")).toBe("passive");
    expect(classifyCommentIntent("🔥🔥🔥")).toBe("passive");
  });
});

describe("analyzeCommentSample", () => {
  it("uses sample-based commercial summary for product curiosity", () => {
    const intent = analyzeCommentSample([
      "where is this dress from?",
      "so cute",
      "love this",
    ]);
    expect(intent.productCuriosityPct).toBeGreaterThan(0);
    expect(intent.commercialSummary).toMatch(/product curiosity|commercial interest/i);
    expect(intent.commercialSummary).not.toMatch(/0% purchase/i);
    expect(commercialSignalPct(intent)).toBeGreaterThan(0);
  });

  it("returns unmeasured copy when sample is empty", () => {
    const intent = analyzeCommentSample([]);
    expect(intent.total).toBe(0);
    expect(intent.commercialSummary).toMatch(/unmeasured/i);
  });
});
