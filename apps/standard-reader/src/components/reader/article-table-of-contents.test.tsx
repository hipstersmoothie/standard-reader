// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildHeadingOutline } from "#/lib/document/heading-outline";

import { ArticleTableOfContents } from "./article-table-of-contents";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

describe("ArticleTableOfContents", () => {
  it("renders nothing for fewer than three headings", () => {
    const { container } = renderWithI18n(
      <ArticleTableOfContents outline={outline.slice(0, 2)} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("starts collapsed so heading text can't spoil anything", () => {
    renderWithI18n(<ArticleTableOfContents outline={outline} />);
    const toggle = screen.getByRole("button", { name: /contents/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#act-one",
      "#the-twist",
      "#act-two",
    ]);
  });

  it("is skipped by narration alignment", () => {
    const { container } = renderWithI18n(
      <ArticleTableOfContents outline={outline} />,
    );
    expect(container.querySelector("[data-reader-skip]")).not.toBeNull();
  });

  it("scrolls to the heading and replaces the hash in place", () => {
    const heading = document.createElement("h2");
    heading.id = "the-twist";
    const scrollIntoView = vi.fn();
    heading.scrollIntoView = scrollIntoView;
    document.body.append(heading);
    const historyLength = globalThis.history.length;

    renderWithI18n(<ArticleTableOfContents outline={outline} />);
    fireEvent.click(screen.getByRole("button", { name: /contents/i }));
    fireEvent.click(screen.getByRole("link", { name: "The twist" }));

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(globalThis.location.hash).toBe("#the-twist");
    expect(globalThis.history.length).toBe(historyLength);
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });
});
