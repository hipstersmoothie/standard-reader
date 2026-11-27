// @vitest-environment jsdom
import { Avatar } from "@standard-reader/design-system/avatar";
import {
  ImageSrcProvider,
  useResolveImageSrc,
} from "@standard-reader/design-system/image-source";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { rewriteImageCdnUrl } from "#/lib/image-cdn";
import { cdnImageUrl } from "#/server/atproto/blob";

/**
 * The image server preference never reaches the server-built URLs — it is
 * applied at render time through the design system's `ImageSrcProvider`. These
 * pin that both paths into an `<img src>` honour it: design-system components
 * (Avatar) and app components using `useResolveImageSrc`.
 */

const URL_ON_BSKY = cdnImageUrl("did:plc:abc", "bafkreiabc", "png");
const toPorxie = (src: string) => rewriteImageCdnUrl(src, "porxie");

function AppImage({ src }: { src: string | null }) {
  const resolveImageSrc = useResolveImageSrc();
  return src ? <img alt="" src={resolveImageSrc(src)} /> : null;
}

afterEach(cleanup);

describe("ImageSrcProvider", () => {
  it("rewrites design-system Avatar images", () => {
    const { container } = render(
      <ImageSrcProvider transform={toPorxie}>
        <Avatar src={URL_ON_BSKY} alt="Ada" fallback="A" />
      </ImageSrcProvider>,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://porxie-bsky.dollware.net/img/feed_fullsize/plain/did%3Aplc%3Aabc/bafkreiabc@png",
    );
  });

  it("rewrites app images that resolve through the hook", () => {
    const { container } = render(
      <ImageSrcProvider transform={toPorxie}>
        <AppImage src={URL_ON_BSKY} />
      </ImageSrcProvider>,
    );
    expect(
      container
        .querySelector("img")
        ?.getAttribute("src")
        ?.startsWith("https://porxie-bsky.dollware.net/img/"),
    ).toBe(true);
  });

  it("leaves images untouched without a provider (e.g. in the extension)", () => {
    const { container } = render(
      <>
        <Avatar src={URL_ON_BSKY} alt="Ada" fallback="A" />
        <AppImage src={URL_ON_BSKY} />
      </>,
    );
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("src")).toBe(URL_ON_BSKY);
    }
  });
});
