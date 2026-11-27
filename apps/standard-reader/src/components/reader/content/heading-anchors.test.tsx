// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TocNode } from "#/lib/document/heading-outline";
import {
  buildHeadingOutline,
  nestHeadingOutline,
} from "#/lib/document/heading-outline";

import {
  HeadingAnchorRegistry,
  useHeadingAnchorId,
} from "./heading-anchor-registry";
import { HeadingAnchorProvider } from "./heading-anchors";

afterEach(cleanup);

const outline = buildHeadingOutline([
  { level: 2, text: "Intro" },
  { level: 2, text: "Notes" },
  { level: 3, text: "Detail" },
  { level: 2, text: "Notes" },
]);

describe("HeadingAnchorRegistry", () => {
  it("gives a unique-text heading its id regardless of who asks", () => {
    const registry = new HeadingAnchorRegistry(outline);
    expect(registry.idFor("Intro", "a")).toBe("intro");
    expect(registry.idFor("  Intro ", "b")).toBe("intro");
  });

  it("hands same-text ids out in order and pins them to the asker", () => {
    const registry = new HeadingAnchorRegistry(outline);
    expect(registry.idFor("Notes", "first")).toBe("notes");
    expect(registry.idFor("Notes", "second")).toBe("notes-2");
    // A re-render of the first heading keeps its id.
    expect(registry.idFor("Notes", "first")).toBe("notes");
    // A third same-text heading the outline never counted gets none.
    expect(registry.idFor("Notes", "third")).toBeUndefined();
  });

  it("returns nothing for text outside the outline", () => {
    expect(
      new HeadingAnchorRegistry(outline).idFor("Elsewhere", "x"),
    ).toBeUndefined();
  });
});

function Heading({ text }: { text: string }) {
  const id = useHeadingAnchorId(text);
  return <h2 id={id}>{text}</h2>;
}

describe("useHeadingAnchorId", () => {
  it("assigns ids in document order, stable across re-renders", () => {
    const tree = (
      <HeadingAnchorProvider outline={outline}>
        <Heading text="Intro" />
        <Heading text="Notes" />
        <Heading text="Detail" />
        <Heading text="Notes" />
      </HeadingAnchorProvider>
    );
    const { container, rerender } = render(tree);
    const ids = () =>
      [...container.querySelectorAll("h2")].map((heading) => heading.id);
    expect(ids()).toEqual(["intro", "notes", "detail", "notes-2"]);
    rerender(tree);
    expect(ids()).toEqual(["intro", "notes", "detail", "notes-2"]);
  });

  it("is a no-op outside an article", () => {
    const { container } = render(<Heading text="Intro" />);
    expect(container.querySelector("h2")?.hasAttribute("id")).toBe(false);
  });
});

const shape = (nodes: ReadonlyArray<TocNode>): Array<unknown> =>
  nodes.map((node) =>
    node.children.length > 0
      ? [node.entry.text, shape(node.children)]
      : node.entry.text,
  );

describe("nestHeadingOutline", () => {
  it("nests deeper levels under the previous shallower heading", () => {
    const nested = nestHeadingOutline(
      buildHeadingOutline([
        { level: 1, text: "A" },
        { level: 2, text: "A.1" },
        { level: 4, text: "A.1.a" },
        { level: 2, text: "A.2" },
        { level: 1, text: "B" },
      ]),
    );
    expect(shape(nested)).toEqual([["A", [["A.1", ["A.1.a"]], "A.2"]], "B"]);
  });

  it("keeps an outline that opens deeper than it continues flat", () => {
    const nested = nestHeadingOutline(
      buildHeadingOutline([
        { level: 3, text: "x" },
        { level: 2, text: "y" },
      ]),
    );
    expect(nested.map((node) => node.entry.text)).toEqual(["x", "y"]);
  });
});
