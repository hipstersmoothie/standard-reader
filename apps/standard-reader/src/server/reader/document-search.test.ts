import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  documentMetaVectorDdl,
  NAME_MATCH_AMBIGUITY_CAP,
  searchQueryShape,
  SEARCH_POOL_CAP,
  shouldUseAuthorArm,
} from "./document-search";

/** Whitespace-insensitive compare: SQL formatting differs between the
 * rendered expression and the hand-written migration. */
const normalize = (text: string) => text.replaceAll(/\s+/g, " ").trim();

describe("searchQueryShape", () => {
  it("treats a multi-word title as a phrase candidate", () => {
    const shape = searchQueryShape("  Making Feeds: Custom Logic Requests ");
    expect(shape.query).toBe("Making Feeds: Custom Logic Requests");
    expect(shape.tokenCount).toBe(5);
    expect(shape.isMultiToken).toBe(true);
  });

  it("does not phrase-score a single word", () => {
    // `phraseto_tsquery` degenerates to `websearch_to_tsquery` here, so the
    // phrase tiers would fire on every match and flatten the ranking.
    expect(searchQueryShape("ai").isMultiToken).toBe(false);
    expect(searchQueryShape("typography").isMultiToken).toBe(false);
  });

  it("splits a handle into tokens rather than treating it as one word", () => {
    expect(searchQueryShape("alice.bsky.social").tokenCount).toBe(3);
  });

  it("has no tokens for an empty query", () => {
    expect(searchQueryShape("   ").tokenCount).toBe(0);
    expect(searchQueryShape("   ").isMultiToken).toBe(false);
  });
});

describe("shouldUseAuthorArm", () => {
  it("arms for a handle hint however many profiles matched", () => {
    expect(shouldUseAuthorArm(true, 1)).toBe(true);
    expect(shouldUseAuthorArm(true, 50)).toBe(true);
  });

  it("arms for plain text that names a few people", () => {
    expect(shouldUseAuthorArm(false, 1)).toBe(true);
    expect(shouldUseAuthorArm(false, NAME_MATCH_AMBIGUITY_CAP)).toBe(true);
  });

  it("drops an ambiguous plain-text term", () => {
    // "art" used to pull in every document by every profile containing "art",
    // eating pool budget that real text matches needed.
    expect(shouldUseAuthorArm(false, NAME_MATCH_AMBIGUITY_CAP + 1)).toBe(false);
    expect(shouldUseAuthorArm(false, 50)).toBe(false);
  });

  it("stays off when nothing matched", () => {
    expect(shouldUseAuthorArm(true, 0)).toBe(false);
    expect(shouldUseAuthorArm(false, 0)).toBe(false);
  });
});

describe("pool caps", () => {
  it("bounds paging at the total pool size", () => {
    expect(SEARCH_POOL_CAP).toBe(900);
  });
});

describe("meta vector index drift", () => {
  /**
   * The planner only matches an expression index when the query repeats the
   * expression verbatim. Nothing at runtime complains when it stops matching —
   * search just quietly degrades to a sequential scan of every document — so
   * assert the migration still indexes exactly what the query asks for.
   */
  it("migration 0044 indexes exactly what documentMetaVectorSql renders", () => {
    const expression = new PgDialect().sqlToQuery(documentMetaVectorDdl()).sql;
    const migration = readFileSync(
      fileURLToPath(
        new URL(
          "../../../drizzle/0044_document_meta_search_idx.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(normalize(migration)).toContain(normalize(expression));
  });

  it("keeps the runbook's CONCURRENTLY build in step with the migration", () => {
    const expression = new PgDialect().sqlToQuery(documentMetaVectorDdl()).sql;
    const runbook = readFileSync(
      fileURLToPath(
        new URL(
          "../../../scripts/search-relevance-indexes.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(normalize(runbook)).toContain(normalize(expression));
  });
});
