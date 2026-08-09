import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { withLineBreaks } from "./line-breaks";

/** The markup a run's text renders to, as it would appear in a paragraph. */
function render(text: string): string {
  return renderToStaticMarkup(withLineBreaks(text));
}

describe("withLineBreaks", () => {
  it("renders a hard break as a real <br>", () => {
    // Without this the newline is collapsed to a space by HTML and the two
    // lines run together — the Markpub / Mochott / GreenGale break bug.
    expect(render("Line one\nLine two")).toBe("Line one<br/>Line two");
  });

  it("keeps consecutive breaks", () => {
    expect(render("a\n\nb")).toBe("a<br/><br/>b");
  });

  it("keeps a leading and a trailing break", () => {
    expect(render("\na\n")).toBe("<br/>a<br/>");
  });

  it("leaves text with no newline untouched", () => {
    expect(withLineBreaks("just text")).toBe("just text");
  });
});
