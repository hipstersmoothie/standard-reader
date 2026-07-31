/**
 * The `at:` tags are rendered from the router's match store inside the root
 * shell, not from route `head.meta` — see `AtRecordMeta`. That wiring is easy to
 * break silently (a route's loader data stops reaching the shell and the tags
 * just vanish), so render a real router through it and assert on the HTML.
 */
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AtRecordMeta } from "./at-record-meta.tsx";

const DID = "did:plc:sov5kv5byjmdksdjacjiysg3";
const DOCUMENT = `at://${DID}/site.standard.document/3mrnculcx5c2v`;
const PUBLICATION = `at://${DID}/site.standard.publication/3mnuandrwh22s`;
const BSKY_POST = `at://${DID}/app.bsky.feed.post/3mrnculiuls2c`;

async function renderRoute(loader: () => unknown) {
  const rootRoute = createRootRoute({
    shellComponent: ({ children }: { children: React.ReactNode }) =>
      createElement("div", null, createElement(AtRecordMeta), children),
  });
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/article",
    loader,
    component: () => createElement("main"),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([articleRoute]),
    history: createMemoryHistory({ initialEntries: ["/article"] }),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
}

describe("AtRecordMeta", () => {
  it("renders every tag a route declares, repeats included", async () => {
    const html = await renderRoute(() => ({
      atMeta: {
        canonical: [DOCUMENT],
        alternate: [PUBLICATION, BSKY_POST],
        author: [DID],
      },
    }));

    // Both alternates survive — the reason these aren't route `head.meta`
    // entries, which TanStack dedupes by `name`.
    expect(html).toContain(`<meta name="at:canonical" content="${DOCUMENT}"/>`);
    expect(html).toContain(
      `<meta name="at:alternate" content="${PUBLICATION}"/>`,
    );
    expect(html).toContain(
      `<meta name="at:alternate" content="${BSKY_POST}"/>`,
    );
    expect(html).toContain(`<meta name="at:author" content="at://${DID}"/>`);
  });

  it("renders nothing for a route that declares no records", async () => {
    const html = await renderRoute(() => ({ title: "Latest" }));
    expect(html).not.toContain("at:");
  });
});
