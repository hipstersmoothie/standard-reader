// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { articleHeadingOutline } from "#/lib/document/heading-outline";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";
import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";

import { HeadingAnchorProvider } from "./heading-anchors";
import { CONTENT_RENDERERS } from "./renderers";

/**
 * The outline and the renderers parse the body separately, and headings find
 * their id by text — so the thing worth proving is that, per format, every
 * rendered heading carries exactly the id its outline entry links to.
 */

afterEach(cleanup);

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
i18n.activate("en");

function renderedIds(body: unknown, description?: string) {
  const content = body as JsonValue;
  const outline = articleHeadingOutline({ contentJson: content, description });
  const format = (content as { $type: string }).$type;
  const Renderer = CONTENT_RENDERERS[format];
  if (!Renderer) throw new Error(`no renderer for ${format}`);

  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <HeadingAnchorProvider outline={outline}>
          <Renderer
            content={content}
            hasHero={false}
            leadDescription={description}
          />
        </HeadingAnchorProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );

  const headings = [
    ...container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
  ].filter((heading) => heading.id);
  return {
    outlineIds: outline.map((entry) => entry.id),
    headingIds: headings.map((heading) => heading.id),
  };
}

describe("heading anchors across renderers", () => {
  it("Leaflet", () => {
    const content = {
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.linearDocument,
          blocks: [
            { $type: LEAFLET_BLOCK.header, level: 2, plaintext: "Setup" },
            { $type: LEAFLET_BLOCK.text, plaintext: "Body text." },
            { $type: LEAFLET_BLOCK.header, level: 3, plaintext: "Setup" },
            { $type: LEAFLET_BLOCK.header, level: 2, plaintext: "Wrap-up" },
          ].map((block) => ({ block })),
        },
      ],
    };
    const { outlineIds, headingIds } = renderedIds(content);
    expect(outlineIds).toEqual(["setup", "setup-2", "wrap-up"]);
    expect(headingIds).toEqual(outlineIds);
  });

  it("pckt, with the dek-duplicating heading dropped", () => {
    const content = {
      $type: PCKT_CONTENT,
      items: [
        { $type: PCKT_BLOCK.heading, level: 1, plaintext: "Dek" },
        { $type: PCKT_BLOCK.heading, level: 2, plaintext: "One" },
        { $type: PCKT_BLOCK.text, plaintext: "Body text." },
        { $type: PCKT_BLOCK.heading, level: 2, plaintext: "Two" },
      ],
    };
    const { outlineIds, headingIds } = renderedIds(content, "Dek");
    expect(outlineIds).toEqual(["one", "two"]);
    expect(headingIds).toEqual(outlineIds);
  });

  it("markdown (renderer-react)", () => {
    const content = {
      $type: STANDARD_MARKDOWN_CONTENT,
      text: "# Title\n\nBody.\n\n## A *styled* heading\n\n### Title\n\ntext",
    };
    const { outlineIds, headingIds } = renderedIds(content);
    expect(outlineIds).toEqual(["title", "a-styled-heading", "title-2"]);
    expect(headingIds).toEqual(outlineIds);
  });

  it("HTML-in-record (react-markdown)", () => {
    const content = {
      $type: "org.wordpress.html",
      html: "<h2>First <code>step</code></h2><p>Body.</p><h3>Second</h3>",
    };
    const { outlineIds, headingIds } = renderedIds(content);
    expect(outlineIds).toEqual(["first-step", "second"]);
    expect(headingIds).toEqual(outlineIds);
  });
});
