/**
 * Which routes the router is allowed to position the scroll on.
 *
 * The article reader restores the reader's saved position itself
 * (`use-reading-progress.ts`), and the router has three separate ways of
 * undoing that, all of which run outside the route's own tree:
 *
 *  1. the `onRendered` subscription, from a layout effect mounted as a sibling
 *     *after* the route — so it lands a beat after the route's own restore;
 *  2. an inline `<script>` Start injects into the SSR'd HTML, which runs at
 *     parse time on every hard load and ends in `scrollTo(0, 0)`;
 *  3. the `sessionStorage` cache the first two share, which is keyed per
 *     history entry and so misses on every fresh navigation to the same
 *     article — meaning the fallback (the top) is what a reader normally gets.
 *
 * Correcting after the fact means racing all three forever. Handing the router
 * a function instead turns every one of them off for the locations it returns
 * false for — the check guards the `onRendered` body *and*
 * `getScrollRestorationScriptForRouter`, so the inline script isn't even
 * emitted. One switch, no race.
 *
 * Everything else on the site keeps the router's restoration untouched.
 */

/** Article reader route: `/a/$did/$rkey`. */
const ARTICLE_PATH_PREFIX = "/a/";

export function routerOwnsScroll({
  pathname,
  hash,
}: {
  pathname: string;
  hash: string;
}): boolean {
  // A `#hash` stays the router's business even here. It is the one case the
  // reader named a destination out loud, the article view deliberately declines
  // to restore over it, and on a hard load the router's inline script is what
  // scrolls the anchor into view before hydration — so switching it off would
  // leave the anchor unhandled entirely.
  if (hash) return true;

  return !pathname.startsWith(ARTICLE_PATH_PREFIX);
}
