import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "#/db/schema";

import {
  documentInLanguagesSql,
  documentInLanguagesWhere,
} from "./language-filters";

const dialect = new PgDialect();

function render(fragment: SQL | undefined) {
  if (fragment === undefined) {
    throw new Error("expected a predicate, got undefined");
  }
  return dialect.sqlToQuery(fragment);
}

describe("documentInLanguagesWhere", () => {
  it("is absent when the reader has no filter", () => {
    // The default. Callers spread the result into a conditions array, so
    // `undefined` has to mean "add nothing" rather than "match nothing".
    expect(documentInLanguagesWhere(schema)).toBeUndefined();
    expect(documentInLanguagesWhere(schema, [])).toBeUndefined();
  });

  it("always lets untagged documents through", () => {
    const where = documentInLanguagesWhere(schema, ["en"]);
    expect(where).toBeDefined();
    const query = render(where);
    // "Not tagged as something else" — a filter narrows on positive evidence
    // only, so a document the detector declined to place (NULL `lang`) or never
    // looked at (no row) is never hidden.
    expect(query.sql).toContain("NOT EXISTS");
    expect(query.sql).toContain("lang IS NOT NULL");
    expect(query.sql).toContain("NOT IN");
    expect(query.params).toContain("en");
  });

  it("carries every chosen language as a parameter", () => {
    const query = render(documentInLanguagesWhere(schema, ["en", "ja", "pt"]));
    expect(query.params).toEqual(expect.arrayContaining(["en", "ja", "pt"]));
  });
});

describe("documentInLanguagesSql", () => {
  it("renders nothing to interpolate when there is no filter", () => {
    expect(render(documentInLanguagesSql(sql`d.uri`)).sql).toBe("");
    expect(render(documentInLanguagesSql(sql`d.uri`, [])).sql).toBe("");
  });

  it("renders a leading AND so it can be spliced into a WHERE unconditionally", () => {
    const query = render(documentInLanguagesSql(sql`d.uri`, ["en"]));
    expect(query.sql.trim().startsWith("AND")).toBe(true);
    expect(query.sql).toContain("NOT EXISTS");
    expect(query.params).toEqual(["en"]);
  });

  it("renders a flat IN list, not a row constructor", () => {
    // Interpolating the array directly renders `IN (($1, $2, $3))`, which
    // Postgres parses as a row comparison and rejects at runtime — and only
    // for readers who actually set a filter, so nothing else would catch it.
    const query = render(documentInLanguagesSql(sql`d.uri`, ["en", "ja"]));
    expect(query.sql).toContain("NOT IN ($1, $2)");
    expect(query.sql).not.toContain("(($1");
    expect(query.params).toEqual(["en", "ja"]);
  });

  it("uses the caller's column, since these queries alias documents", () => {
    const query = render(documentInLanguagesSql(sql`t.uri`, ["ja"]));
    expect(query.sql).toContain("= t.uri");
  });
});
