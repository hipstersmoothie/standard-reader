import { describe, expect, it } from "vitest";

import { iframeReferrerPolicy } from "./iframe-embed.utils";

describe("iframeReferrerPolicy", () => {
  it("sends the origin to players that degrade without a Referer", () => {
    for (const url of [
      "https://www.youtube.com/embed/abc",
      "https://youtu.be/abc",
      "https://player.vimeo.com/video/123",
      "https://fast.wistia.com/embed/medias/abc",
      // Spotify's player renders a short compact card without a referrer,
      // leaving empty space below it in the height its oEmbed asks for.
      "https://open.spotify.com/embed/playlist/0X9tRNlBm5jB1Wew3Y3i6d?utm_source=oembed",
      "https://open.spotify.com/embed/track/abc",
    ]) {
      expect(iframeReferrerPolicy(url)).toBe("strict-origin-when-cross-origin");
    }
  });

  it("withholds the Referer from other embeds by default", () => {
    for (const url of [
      "https://example.com/embed",
      "https://codepen.io/pen/abc",
    ]) {
      expect(iframeReferrerPolicy(url)).toBe("no-referrer");
    }
  });
});
