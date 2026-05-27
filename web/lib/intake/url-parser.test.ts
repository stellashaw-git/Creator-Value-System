import { describe, expect, it } from "vitest";
import { parseCreatorProfileUrl } from "./url-parser";

describe("parseCreatorProfileUrl", () => {
  it("parses Instagram profile URLs", () => {
    expect(parseCreatorProfileUrl("https://www.instagram.com/somecreator/")).toEqual({
      platform: "Instagram",
      handle: "somecreator",
      normalizedUrl: "https://www.instagram.com/somecreator/",
    });
    expect(parseCreatorProfileUrl("instagram.com/ivypang.styled")).toEqual({
      platform: "Instagram",
      handle: "ivypang.styled",
      normalizedUrl: "https://www.instagram.com/ivypang.styled/",
    });
  });

  it("rejects Instagram post/reel URLs", () => {
    expect(parseCreatorProfileUrl("https://www.instagram.com/p/ABC123/")).toBeNull();
    expect(parseCreatorProfileUrl("https://www.instagram.com/reel/xyz/")).toBeNull();
  });

  it("parses TikTok profile URLs", () => {
    expect(parseCreatorProfileUrl("https://www.tiktok.com/@creatorname")).toEqual({
      platform: "TikTok",
      handle: "creatorname",
      normalizedUrl: "https://www.tiktok.com/@creatorname",
    });
  });

  it("rejects TikTok video URLs", () => {
    expect(
      parseCreatorProfileUrl("https://www.tiktok.com/@user/video/1234567890")
    ).toBeNull();
  });

  it("parses YouTube channel URLs", () => {
    expect(parseCreatorProfileUrl("https://www.youtube.com/@MyChannel")).toEqual({
      platform: "YouTube",
      handle: "MyChannel",
      normalizedUrl: "https://www.youtube.com/@MyChannel",
    });
    expect(parseCreatorProfileUrl("https://youtube.com/channel/UCxxxxxxxx")).toEqual({
      platform: "YouTube",
      handle: "UCxxxxxxxx",
      normalizedUrl: "https://www.youtube.com/channel/UCxxxxxxxx",
    });
  });

  it("rejects YouTube watch URLs", () => {
    expect(
      parseCreatorProfileUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBeNull();
  });

  it("parses X / Twitter profile URLs", () => {
    expect(parseCreatorProfileUrl("https://x.com/somecreator")).toEqual({
      platform: "X / Twitter",
      handle: "somecreator",
      normalizedUrl: "https://x.com/somecreator",
    });
    expect(parseCreatorProfileUrl("https://twitter.com/brand_name")).toEqual({
      platform: "X / Twitter",
      handle: "brand_name",
      normalizedUrl: "https://x.com/brand_name",
    });
  });

  it("rejects X status URLs", () => {
    expect(parseCreatorProfileUrl("https://x.com/user/status/123")).toBeNull();
  });

  it("parses Xiaohongshu profile URLs", () => {
    expect(
      parseCreatorProfileUrl("https://www.xiaohongshu.com/user/profile/5f9a1b2c3d4e5f6a7b8c9d0e")
    ).toEqual({
      platform: "Xiaohongshu / RED",
      handle: "5f9a1b2c3d4e5f6a7b8c9d0e",
      normalizedUrl:
        "https://www.xiaohongshu.com/user/profile/5f9a1b2c3d4e5f6a7b8c9d0e",
    });
  });

  it("returns null for invalid or unsupported URLs", () => {
    expect(parseCreatorProfileUrl("")).toBeNull();
    expect(parseCreatorProfileUrl("   ")).toBeNull();
    expect(parseCreatorProfileUrl("not a url")).toBeNull();
    expect(parseCreatorProfileUrl("https://example.com/user")).toBeNull();
    expect(parseCreatorProfileUrl("https://www.facebook.com/creator")).toBeNull();
  });
});
