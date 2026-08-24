// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthorEmbedMeta } from "#/integrations/tanstack-query/api-author.functions";
import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";

import { FollowCard } from "./follow-card";
import { SubscribeCard } from "./subscribe-card";

/**
 * An embed card renders inside an iframe on somebody else's site. Every link it
 * shows therefore has to open a tab: an in-app link navigates the iframe, which
 * loads the whole of Standard Reader into the host page's 400px box.
 *
 * That is what these assert — not the specific links, but the invariant. It was
 * reported from the wild against the shipped subscribe embed, where the
 * publication name and the owner byline were ordinary client-side links.
 */

const PUBLICATION: PublicationEmbedMeta = {
  uri: "at://did:plc:abc123/site.standard.publication/3lz3s33asuc2l",
  did: "did:plc:abc123",
  rkey: "3lz3s33asuc2l",
  name: "Annotated",
  description: "Notes in the margin.",
  topic: "Books",
  iconUrl: null,
  ownerAvatarUrl: null,
  ownerDisplayName: "Ada Lovelace",
  ownerHandle: "ada.test",
  themeBackground: null,
  themeForeground: null,
  themeAccent: null,
  themeAccentForeground: null,
};

const AUTHOR: AuthorEmbedMeta = {
  did: "did:plc:abc123",
  handle: "ada.test",
  displayName: "Ada Lovelace",
  description: "Writes about looms.",
  avatarUrl: null,
};

// A bare instance rather than `i18nForLocale` — that module imports the `.po`
// catalogs, which only the app's Vite config knows how to load. With no
// catalog Lingui renders each message's source text, which is all these need.
const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function renderCard(ui: ReactElement) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
}

// Vitest runs without `globals`, so Testing Library never registers its own
// afterEach — without this the DOM accumulates across cases in this file.
afterEach(cleanup);

function anchors(): Array<HTMLAnchorElement> {
  return [...document.querySelectorAll("a")];
}

// Factories rather than elements: each case renders fresh, and a bare element
// in a `.each` table reads to the linter as an unkeyed array item.
describe.each([
  [
    "subscribe embed",
    () => (
      <SubscribeCard
        meta={PUBLICATION}
        phase="embed"
        subscribeHref="https://standard-reader.app/subscribe/did:plc:abc123/3lz3s33asuc2l"
        layout="portrait"
      />
    ),
    "/p/did%3Aplc%3Aabc123/3lz3s33asuc2l",
  ],
  [
    "follow embed",
    () => (
      <FollowCard
        meta={AUTHOR}
        phase="embed"
        followHref="https://standard-reader.app/follow/did:plc:abc123"
        layout="portrait"
      />
    ),
    "/u/did%3Aplc%3Aabc123",
  ],
] as const)("%s", (_name, card, expectedHref) => {
  it("opens every link in a new tab rather than navigating the iframe", () => {
    renderCard(card());

    const links = anchors();
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) {
      expect(link.getAttribute("target"), link.outerHTML).toBe("_blank");
      expect(link.getAttribute("rel"), link.outerHTML).toContain("noopener");
    }
  });

  it("still links the title to the subject's page", () => {
    renderCard(card());
    expect(anchors().map((a) => a.getAttribute("href"))).toContain(
      expectedHref,
    );
  });

  it("names the subject", () => {
    renderCard(card());
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });
});
