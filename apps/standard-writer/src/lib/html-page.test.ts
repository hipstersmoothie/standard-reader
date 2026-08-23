import { describe, expect, it } from "vitest";

import { htmlPage } from "./html-page";

describe("htmlPage", () => {
  it("returns an HTML response with the title and message", async () => {
    const res = htmlPage("Unsubscribed", "You won’t hear from us again.");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("<title>Unsubscribed</title>");
    expect(body).toContain("You won’t hear from us again.");
  });

  it("escapes HTML metacharacters in title and message", async () => {
    const body = await htmlPage(
      "A <b>bold</b> & tricky title",
      "1 < 2 && 3 > 2",
    ).text();
    expect(body).toContain("A &lt;b&gt;bold&lt;/b&gt; &amp; tricky title");
    expect(body).toContain("1 &lt; 2 &amp;&amp; 3 &gt; 2");
    // The injected markup must not appear unescaped in the body content.
    expect(body).not.toContain("<b>bold</b>");
  });

  it("honors a custom status code", () => {
    expect(htmlPage("Nope", "Bad link", 410).status).toBe(410);
  });
});
