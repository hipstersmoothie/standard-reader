import { describe, expect, it } from "vitest";

import {
  leadingMarkupImageUrl,
  resolveArticleHeroImage,
  stripLeadingMarkupImage,
} from "./lead-image";

const author = { did: "did:plc:author", authorPds: "https://pds.example" };

describe("leadingMarkupImageUrl", () => {
  it("reads a leading markdown image", () => {
    expect(
      leadingMarkupImageUrl(
        "![Alt text](https://cdn.example/hero.jpg)\n\nBody",
      ),
    ).toBe("https://cdn.example/hero.jpg");
  });

  it("reads a leading HTML image", () => {
    expect(
      leadingMarkupImageUrl(
        '<img src="https://cdn.example/hero.jpg" alt="" />\n<p>Body</p>',
      ),
    ).toBe("https://cdn.example/hero.jpg");
  });

  it("ignores images that are not first", () => {
    expect(
      leadingMarkupImageUrl("Intro\n\n![Later](https://cdn.example/late.jpg)"),
    ).toBeNull();
  });
});

describe("stripLeadingMarkupImage", () => {
  it("removes a leading markdown image", () => {
    expect(
      stripLeadingMarkupImage(
        "![Alt](https://cdn.example/hero.jpg)\n\nFirst paragraph.",
      ),
    ).toBe("First paragraph.");
  });
});

describe("resolveArticleHeroImage", () => {
  it("prefers a leading content image over coverImageUrl", () => {
    const hero = resolveArticleHeroImage({
      ...author,
      coverImageUrl: "https://cdn.example/cover.jpg",
      contentFormat: "site.standard.content.markdown",
      contentJson: {
        $type: "site.standard.content.markdown",
        text: "![Lead](https://cdn.example/lead.jpg)\n\nBody copy.",
      },
    });
    expect(hero).toEqual({
      url: "https://cdn.example/lead.jpg",
      fromFirstBlock: true,
    });
  });

  it("falls back to coverImageUrl when the body does not open with an image", () => {
    const hero = resolveArticleHeroImage({
      ...author,
      coverImageUrl: "https://cdn.example/cover.jpg",
      contentFormat: "site.standard.content.markdown",
      contentJson: {
        $type: "site.standard.content.markdown",
        text: "Opening paragraph.\n\n![Later](https://cdn.example/late.jpg)",
      },
    });
    expect(hero).toEqual({
      url: "https://cdn.example/cover.jpg",
      fromFirstBlock: false,
    });
  });

  it("promotes the first leaflet image block", () => {
    const hero = resolveArticleHeroImage({
      ...author,
      coverImageUrl: null,
      contentFormat: "pub.leaflet.content",
      contentJson: {
        $type: "pub.leaflet.content",
        pages: [
          {
            id: "p1",
            blocks: [
              {
                $type: "pub.leaflet.blocks.image",
                image: { $type: "blob", ref: { $link: "bafyhero" } },
              },
            ],
          },
        ],
      },
    });
    expect(hero?.fromFirstBlock).toBe(true);
    expect(hero?.url).toContain("bafyhero");
  });
});
