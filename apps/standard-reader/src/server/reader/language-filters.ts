/**
 * The reader's language filter, as SQL.
 *
 * Narrows a document query to the languages a reader chose in Settings →
 * Feed → Languages (`user.feed_languages`, decoded by
 * `#/lib/content-language`). Applied only on **network-wide surfaces** — Latest
 * "All", Discover, search, tag pages, trending, related articles — exactly
 * where {@link notWebBridgeArticleWhere} is applied, and for the same reason:
 * these are the places the app chose what to put in front of you.
 *
 * Deliberately **not** applied to anything the reader chose themselves: their
 * subscriptions feed, a publication page they opened, an article they clicked,
 * their own library. Subscribing to a source is an explicit "yes, this one",
 * and a preference about discovery should not quietly retract it — a reader who
 * follows one Portuguese blog and reads mostly English should not have to
 * choose between the filter and the blog.
 *
 * Publications are not filtered. A publication has no language of its own — a
 * group blog can carry three — so Discover's publication rails and the
 * directory ignore this preference. Only documents are tagged, and only
 * documents are filtered.
 */

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { Schema } from "#/integrations/tanstack-query/api-shapes";

/**
 * Restrict to documents written in one of `languages`.
 *
 * **Untagged documents always pass.** A document with no `document_languages`
 * row, or one whose `lang` is NULL, is one the detector has not placed — too
 * little prose, a language outside the vocabulary, or not looked at yet — and
 * that is a statement about our detector, not about the document. Filtering
 * those out would mean a reader who picks "English" stops seeing every short
 * post, every link post, and everything written in the 60 languages we do not
 * list, without ever being told. So the predicate is "not positively tagged as
 * something else": the filter narrows on evidence and nothing else, and its
 * failure mode is showing a document you did not ask for rather than hiding one
 * you did.
 *
 * Returns `undefined` when there is nothing to filter by, so callers can spread
 * it into a conditions array without a branch. An empty selection is the
 * default and means "every language".
 */
export function documentInLanguagesWhere(
  schema: Schema,
  languages?: ReadonlyArray<string>,
): SQL | undefined {
  if (!languages || languages.length === 0) return undefined;
  return notTaggedOutside(sql`${schema.documents.uri}`, languages);
}

/**
 * The same predicate for the hand-written SQL feed queries, which build their
 * `WHERE` as template fragments rather than drizzle conditions and alias
 * `documents` themselves — pass the aliased `uri` column.
 *
 * Returns an empty fragment when there is nothing to filter by, so it can be
 * interpolated unconditionally.
 */
export function documentInLanguagesSql(
  uriColumn: SQL,
  languages?: ReadonlyArray<string>,
): SQL {
  if (!languages || languages.length === 0) return sql``;
  return sql`AND ${notTaggedOutside(uriColumn, languages)}`;
}

/**
 * `NOT EXISTS` a tag naming some other language. One primary-key probe of
 * `document_languages` per candidate row, so a feed walking its own index under
 * a `LIMIT` pays for the rows it returns, not for the corpus.
 */
function notTaggedOutside(
  uriColumn: SQL,
  languages: ReadonlyArray<string>,
): SQL {
  // `sql.join`, not a bare array: interpolating a JS array renders its elements
  // as a parenthesized placeholder list — `IN (($1, $2, $3))` — which Postgres
  // reads as a row constructor and rejects. Joining produces the plain
  // `IN ($1, $2, $3)` this needs.
  const list = sql.join(
    languages.map((code) => sql`${code}`),
    sql`, `,
  );
  return sql`NOT EXISTS (SELECT 1 FROM document_languages filter_lang WHERE filter_lang.document_uri = ${uriColumn} AND filter_lang.lang IS NOT NULL AND filter_lang.lang NOT IN (${list}))`;
}
