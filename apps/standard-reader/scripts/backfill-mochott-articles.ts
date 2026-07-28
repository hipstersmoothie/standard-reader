/**
 * Backfill mochott bodies onto the documents that are missing them.
 *
 * A mochott `site.standard.document` carries no `content` — the body is a
 * `site.mochott.article` at the same rkey (see `#/lib/mochott/types`). Rows
 * ingested before we delivered that collection have `content_json = null`, so
 * they show as link-outs with nothing to read.
 *
 * Strategy: bodyless rows are grouped by repo, and each repo is probed **once**
 * for `site.mochott.article` records. Repos with none (most of them — plenty of
 * publishers simply have no in-record body) cost a single `listRecords` call
 * and are skipped. Repos that do have articles are enumerated in full and
 * matched to their documents by rkey, so a mochott author with 200 posts costs
 * a couple of paginated reads rather than 200 lookups.
 *
 *   pnpm backfill:mochott-articles --dry-run
 *   pnpm backfill:mochott-articles
 *   pnpm backfill:mochott-articles did:plc:… [did:plc:… …]   # just these repos
 *   pnpm backfill:mochott-articles --refresh                 # re-sync bodies we already have
 *
 * Safe to re-run: every write is an idempotent update keyed by document URI, so
 * a second pass over the same rows writes the same values.
 */
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import { hasRenderableArticleBody } from "../src/lib/document/renderable.ts";
import { documentSearchText } from "../src/lib/document/search-text.ts";
import {
  MOCHOTT_ARTICLE,
  mochottArticleContent,
} from "../src/lib/mochott/types.ts";
import { listRepoRecords } from "../src/server/atproto/fetch-record.ts";
import { authorPds } from "../src/server/atproto/identity.ts";
import { parseAtUri } from "../src/server/atproto/uri.ts";
import { sanitizeJson } from "../src/server/ingest/mappers.ts";

const BATCH_SIZE = 200;
/** How many document URIs a dry run prints before it just counts them. */
const DRY_RUN_SAMPLE = 20;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
/** Also re-sync rows already carrying a mochott body (picks up edits we missed). */
const refresh = args.includes("--refresh");
const onlyDids = args.filter((arg) => arg.startsWith("did:"));

/** Rows a mochott body could belong to: no content at all, or already mochott. */
function candidateFilter() {
  const bodyless = isNull(documents.contentJson);
  const scope = refresh
    ? or(bodyless, eq(documents.contentFormat, MOCHOTT_ARTICLE))
    : bodyless;
  return and(
    eq(documents.deleted, false),
    scope,
    // Narrow in SQL when the run targets specific repos, so a single-repo
    // re-run doesn't page through every bodyless document in the table.
    onlyDids.length > 0 ? inArray(documents.did, onlyDids) : undefined,
  );
}

interface CandidateRow {
  uri: string;
  did: string;
  rkey: string;
  textContent: string | null;
  contentFormat: string | null;
}

/** Every candidate row, oldest URI first, in pages. */
async function* candidateRows(): AsyncGenerator<Array<CandidateRow>> {
  let cursor: string | null = null;
  for (;;) {
    const where = cursor
      ? and(candidateFilter(), gt(documents.uri, cursor))
      : candidateFilter();
    const rows: Array<CandidateRow> = await db
      .select({
        uri: documents.uri,
        did: documents.did,
        rkey: documents.rkey,
        textContent: documents.textContent,
        contentFormat: documents.contentFormat,
      })
      .from(documents)
      .where(where)
      .orderBy(asc(documents.uri))
      .limit(BATCH_SIZE);

    if (rows.length === 0) return;
    cursor = rows.at(-1)?.uri ?? null;
    yield rows;
    if (rows.length < BATCH_SIZE) return;
  }
}

/**
 * Every `site.mochott.article` in a repo, keyed by rkey. `null` means the repo
 * has none (or could not be read) — probed once and cached for the run.
 */
const articlesByDid = new Map<string, Map<string, unknown> | null>();

async function repoArticles(did: string): Promise<Map<string, unknown> | null> {
  const cached = articlesByDid.get(did);
  if (cached !== undefined) return cached;

  let articles: Map<string, unknown> | null = null;
  reposProbed++;
  try {
    const pds = await authorPds(did, null);
    const { records } = await listRepoRecords(did, MOCHOTT_ARTICLE, pds);
    if (records.length > 0) {
      reposWithArticles++;
      articles = new Map();
      for (const record of records) {
        const rkey = parseAtUri(record.uri)?.rkey;
        const content = mochottArticleContent(record.value);
        if (rkey && content != null) articles.set(rkey, content);
      }
    }
  } catch (error) {
    // Repo gone / PDS unreachable: treat as "no articles" for this run and let
    // a later run pick it up rather than aborting the whole backfill.
    console.warn(
      `  ! ${did}: could not list ${MOCHOTT_ARTICLE} (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  articlesByDid.set(did, articles);
  return articles;
}

let scanned = 0;
let reposProbed = 0;
let reposWithArticles = 0;
let matched = 0;
let updated = 0;

for await (const rows of candidateRows()) {
  scanned += rows.length;

  for (const row of rows) {
    const articles = await repoArticles(row.did);
    if (!articles) continue;

    const content = articles.get(row.rkey);
    if (content == null) continue;
    matched++;

    const contentJson = sanitizeJson(content);
    const textContent = documentSearchText({
      textContent: row.textContent,
      contentJson,
      contentFormat: MOCHOTT_ARTICLE,
    });
    const renderable = hasRenderableArticleBody({
      textContent: row.textContent,
      contentJson,
      contentFormat: MOCHOTT_ARTICLE,
    });

    if (dryRun) {
      if (updated < DRY_RUN_SAMPLE) console.log(`  would set body: ${row.uri}`);
      updated++;
      continue;
    }

    await db
      .update(documents)
      .set({
        contentFormat: MOCHOTT_ARTICLE,
        contentJson,
        hasRenderableBody: renderable,
        textContent,
        updatedAt: sql`now()`,
      })
      .where(eq(documents.uri, row.uri));
    updated++;
  }
}

if (dryRun && updated > DRY_RUN_SAMPLE) {
  console.log(`  … and ${updated - DRY_RUN_SAMPLE} more`);
}

console.log(
  `${scanned} candidate documents scanned; ${reposProbed} repos probed, ${reposWithArticles} with ${MOCHOTT_ARTICLE} records; ` +
    `${matched} documents matched an article; ${dryRun ? "would update" : "updated"} ${updated}.`,
);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
