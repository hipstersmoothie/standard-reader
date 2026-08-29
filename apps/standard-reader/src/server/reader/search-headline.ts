import type { Column } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** `ts_headline` config for titles and publication names (short, all hits). */
export const TS_TITLE_HEADLINE_OPTS =
  "MaxWords=24, MinWords=1, ShortWord=2, HighlightAll=true, StartSel=<mark>, StopSel=</mark>";

/** `ts_headline` config for description/body excerpts (one fragment). */
export const TS_SNIPPET_HEADLINE_OPTS =
  "MaxWords=42, MinWords=14, ShortWord=3, HighlightAll=false, MaxFragments=1, StartSel=<mark>, StopSel=</mark>";

type SqlInput = Column | ReturnType<typeof sql>;

/** How much of the body the snippet is allowed to search for a highlight. */
const SNIPPET_BODY_CHARS = 20_000;

/**
 * Highlight the whole phrase when the source actually contains it, and fall
 * back to the plain term query otherwise.
 *
 * Without this a query like "Making Feeds: Custom Logic Requests" lights up a
 * stray "logic" and "makes" in an unrelated body, which reads as a match and
 * isn't one. `phrase` is null for single-token queries, where the two queries
 * are identical anyway.
 */
export function headlineQuerySql(
  sourceVector: SqlInput,
  tsq: SqlInput,
  phrase: SqlInput | null,
): ReturnType<typeof sql> {
  if (!phrase) return sql`${tsq}`;
  return sql`case when ${sourceVector} @@ ${phrase} then ${phrase} else ${tsq} end`;
}

function tsHeadline(
  source: SqlInput,
  tsq: SqlInput,
  options: string,
): ReturnType<typeof sql<string | null>> {
  return sql<string | null>`nullif(
    btrim(
      ts_headline(
        'english',
        ${source},
        ${tsq},
        ${options}
      )
    ),
    ''
  )`;
}

export function documentSearchTitleHeadline(
  title: SqlInput,
  tsq: SqlInput,
  phrase: SqlInput | null = null,
): ReturnType<typeof sql<string | null>> {
  const source = sql`coalesce(${title}, '')`;
  return tsHeadline(
    source,
    headlineQuerySql(sql`to_tsvector('english', ${source})`, tsq, phrase),
    TS_TITLE_HEADLINE_OPTS,
  );
}

export function documentSearchSnippetHeadline(
  description: SqlInput,
  textContent: SqlInput,
  tsq: SqlInput,
  phrase: SqlInput | null = null,
): ReturnType<typeof sql<string | null>> {
  // Test the phrase against the same truncated source the headline reads, not
  // `search_vector`: the body text is already being fetched to build the
  // headline, so this costs nothing, while `search_vector` would mean a second
  // TOAST fetch per row.
  const source = sql`coalesce(${description}, '') || E'\n\n' || coalesce(substring(${textContent} from 1 for ${sql.raw(String(SNIPPET_BODY_CHARS))}), '')`;
  return tsHeadline(
    source,
    headlineQuerySql(sql`to_tsvector('english', ${source})`, tsq, phrase),
    TS_SNIPPET_HEADLINE_OPTS,
  );
}

export function publicationSearchNameHeadline(
  name: SqlInput,
  tsq: SqlInput,
  phrase: SqlInput | null = null,
): ReturnType<typeof sql<string | null>> {
  const source = sql`coalesce(${name}, '')`;
  return tsHeadline(
    source,
    headlineQuerySql(sql`to_tsvector('english', ${source})`, tsq, phrase),
    TS_TITLE_HEADLINE_OPTS,
  );
}

export function publicationSearchSnippetHeadline(
  description: SqlInput,
  tsq: SqlInput,
): ReturnType<typeof sql<string | null>> {
  return tsHeadline(
    sql`coalesce(${description}, '')`,
    tsq,
    TS_SNIPPET_HEADLINE_OPTS,
  );
}
