import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { documentTierSql } from "./document-search";

const dialect = new PgDialect();

function tierQuery(
  authorDids: Array<string>,
  authorPubUris: Array<string>,
): { params: Array<unknown>; sql: string } {
  const query = dialect.sqlToQuery(
    documentTierSql({
      authorDids,
      authorPubUris,
      did: sql`d.did`,
      exact: "reader",
      metaVector: sql`d.meta_vector`,
      phrase: null,
      publicationUri: sql`d.publication_uri`,
      simplePhrase: null,
      title: sql`d.title`,
      tsq: sql`websearch_to_tsquery('english', 'reader')`,
    }),
  );
  return { params: query.params, sql: query.sql };
}

describe("documentTierSql author arms", () => {
  it("matches a list of authors with `in`, never `any()`", () => {
    // Drizzle expands a JS array in a template into a parenthesised tuple
    // (`($1, $2)`). `in` accepts that; `= any(...)` does not, and Postgres
    // rejects the whole statement — which 500'd `searchDocuments` for every
    // query that matched an author handle or display name, and only those.
    const query = tierQuery(["did:plc:one", "did:plc:two"], []);
    expect(query.sql).not.toContain("any(");
    expect(query.sql).toContain("d.did in ($3, $4)");
    expect(query.params).toEqual([
      "reader",
      "reader",
      "did:plc:one",
      "did:plc:two",
    ]);
  });

  it("matches a list of publications the same way", () => {
    const query = tierQuery(
      [],
      ["at://did:plc:one/site.standard.publication/a"],
    );
    expect(query.sql).not.toContain("any(");
    expect(query.sql).toContain("d.publication_uri in ($3)");
  });

  it("emits no author arm when nothing matched", () => {
    const query = tierQuery([], []);
    expect(query.sql).not.toContain("d.did in");
    expect(query.sql).not.toContain("d.publication_uri in");
  });
});
