import { sql } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/** `ts_headline` config for titles and publication names (short, all hits). */
export const TS_TITLE_HEADLINE_OPTS =
  "MaxWords=24, MinWords=1, ShortWord=2, HighlightAll=true, StartSel=<mark>, StopSel=</mark>";

/** `ts_headline` config for description/body excerpts (one fragment). */
export const TS_SNIPPET_HEADLINE_OPTS =
  "MaxWords=42, MinWords=14, ShortWord=3, HighlightAll=false, MaxFragments=1, StartSel=<mark>, StopSel=</mark>";

type SqlInput = Column | ReturnType<typeof sql>;

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
): ReturnType<typeof sql<string | null>> {
  return tsHeadline(sql`coalesce(${title}, '')`, tsq, TS_TITLE_HEADLINE_OPTS);
}

export function documentSearchSnippetHeadline(
  description: SqlInput,
  textContent: SqlInput,
  tsq: SqlInput,
): ReturnType<typeof sql<string | null>> {
  return tsHeadline(
    sql`coalesce(${description}, '') || E'\n\n' || coalesce(substring(${textContent} from 1 for 12000), '')`,
    tsq,
    TS_SNIPPET_HEADLINE_OPTS,
  );
}

export function publicationSearchNameHeadline(
  name: SqlInput,
  tsq: SqlInput,
): ReturnType<typeof sql<string | null>> {
  return tsHeadline(sql`coalesce(${name}, '')`, tsq, TS_TITLE_HEADLINE_OPTS);
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
