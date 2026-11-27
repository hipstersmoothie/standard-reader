// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildHeadingOutline } from "#/lib/document/heading-outline";

import { ArticleTableOfContentsButton } from "./article-table-of-contents";

// jsdom doesn't implement it; the popover uses it to bring the current
// section into view in a long outline.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  globalThis.history.replaceState(null, "", "/");
});

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
i18n.activate("en");

const renderWithI18n = (ui: ReactElement) =>
  render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);

const outline = buildHeadingOutline([
  { level: 2, text: "Act one" },
  { level: 3, text: "The twist" },
  { level: 2, text: "Act two" },
]);

/** Article headings the outline points at, positioned `tops` px down. */
function mountHeadings(tops: Array<number>) {
  return outline.map((entry, index) => {
    const heading = document.createElement("h2");
    heading.id = entry.id;
    heading.textContent = entry.text;
    heading.getBoundingClientRect = () =>
      ({ top: tops[index] ?? 0 }) as DOMRect;
    heading.scrollIntoView = vi.fn();
    document.body.append(heading);
    return heading;
  });
}

const openContents = () =>
  fireEvent.click(screen.getByRole("button", { name: "Contents" }));

describe("ArticleTableOfContentsButton", () => {
  it("renders nothing for fewer than three headings", () => {
    const { container } = renderWithI18n(
      <ArticleTableOfContentsButton outline={outline.slice(0, 2)} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("keeps the outline closed until asked for", () => {
    renderWithI18n(<ArticleTableOfContentsButton outline={outline} />);
    expect(screen.queryByRole("navigation")).toBeNull();

    openContents();
    const nav = screen.getByRole("navigation", { name: "Table of contents" });
    expect(
      [...nav.querySelectorAll("a")].map((link) => link.getAttribute("href")),
    ).toEqual(["#act-one", "#the-twist", "#act-two"]);
  });

  it("marks the section being read", () => {
    globalThis.innerHeight = 800;
    // "Act one" and "The twist" have scrolled past the top; "Act two" hasn't.
    mountHeadings([-900, -50, 700]);
    renderWithI18n(<ArticleTableOfContentsButton outline={outline} />);
    openContents();
    expect(
      screen
        .getByRole("link", { name: "The twist" })
        .getAttribute("aria-current"),
    ).toBe("location");
    expect(
      screen
        .getByRole("link", { name: "Act two" })
        .hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("jumps to the heading, replaces the hash and closes", async () => {
    const [, twist] = mountHeadings([100, 400, 900]);
    const historyLength = globalThis.history.length;
    renderWithI18n(<ArticleTableOfContentsButton outline={outline} />);

    openContents();
    fireEvent.click(screen.getByRole("link", { name: "The twist" }));

    expect(twist.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(globalThis.location.hash).toBe("#the-twist");
    expect(globalThis.history.length).toBe(historyLength);
    await waitFor(() => {
      expect(screen.queryByRole("navigation")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(twist);
    });
  });
});
