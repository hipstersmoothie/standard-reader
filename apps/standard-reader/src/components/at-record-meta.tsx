import { useRouterState } from "@tanstack/react-router";

import { atMetaFromMatches, atMetaTags } from "#/lib/at-meta-tags";

/**
 * Renders the `at:canonical` / `at:alternate` / `at:author` tags for the deepest
 * matched route that declares any (see `WithAtMeta` in `#/lib/at-meta-tags`).
 *
 * These are raw tags in `RootDocument`'s `<head>` rather than route `head.meta`
 * entries for the same reason `theme-color` is: TanStack dedupes head meta by
 * `name`, and the `at:` convention is explicitly repeatable — an article page
 * carries one `at:alternate` for its publication and another for its companion
 * Bluesky post, and route `head.meta` would collapse them into one.
 */
export function AtRecordMeta() {
  const records = useRouterState({
    select: (state) => atMetaFromMatches(state.matches),
  });

  if (!records) return null;

  return (
    <>
      {atMetaTags(records).map((tag) => (
        <meta
          key={`${tag.name} ${tag.content}`}
          name={tag.name}
          content={tag.content}
        />
      ))}
    </>
  );
}
