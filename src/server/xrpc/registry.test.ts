import { API_DOCS_CATALOG } from "#/lib/api-docs/catalog";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { XRPC_REGISTRY, parseXrpcNsid } from "./registry";

/** Repo record + shared def lexicons — not served as AppView XRPC methods. */
const NON_XRPC_LEXICON_STEMS = new Set([
  "bookmark",
  "defs",
  "list",
  "listSave",
  "read",
]);

function loadAppviewLexiconNsids(): Array<string> {
  const dir = path.join(process.cwd(), "lexicons/app/standard-reader");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((stem) => !NON_XRPC_LEXICON_STEMS.has(stem))
    .map((stem) => `app.standard-reader.${stem}`)
    .toSorted();
}

function loadLexiconMethod(nsid: string): "query" | "procedure" | undefined {
  const stem = nsid.replace("app.standard-reader.", "");
  const file = path.join(
    process.cwd(),
    "lexicons/app/standard-reader",
    `${stem}.json`,
  );
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
    defs?: { main?: { type?: string } };
  };
  const type = doc.defs?.main?.type;
  return type === "query" || type === "procedure" ? type : undefined;
}

describe("XRPC registry", () => {
  it("registers every AppView query/procedure lexicon", () => {
    for (const nsid of loadAppviewLexiconNsids()) {
      expect(XRPC_REGISTRY.has(nsid), `missing handler for ${nsid}`).toBe(true);
    }
  });

  it("has no orphan registry entries without lexicon files", () => {
    const lexiconNsids = new Set(loadAppviewLexiconNsids());
    for (const nsid of XRPC_REGISTRY.keys()) {
      expect(lexiconNsids.has(nsid), `orphan registry entry ${nsid}`).toBe(
        true,
      );
    }
  });

  it("matches lexicon method types (query vs procedure)", () => {
    for (const [nsid, entry] of XRPC_REGISTRY.entries()) {
      expect(entry.method).toBe(loadLexiconMethod(nsid));
    }
  });

  it("matches the public API docs catalog auth and method", () => {
    for (const docEntry of API_DOCS_CATALOG) {
      const registryEntry = XRPC_REGISTRY.get(docEntry.nsid);
      expect(registryEntry, docEntry.nsid).toBeDefined();
      if (!registryEntry) continue;

      const authMap = {
        none: "none",
        required: "required",
        "optional-did": "optional-did",
      } as const;

      expect(registryEntry.method).toBe(docEntry.method);
      expect(registryEntry.auth).toBe(authMap[docEntry.auth]);
    }
  });

  it("assigns OAuth scopes to every write procedure", () => {
    for (const [nsid, entry] of XRPC_REGISTRY.entries()) {
      if (entry.method === "procedure") {
        expect(entry.scopes?.length, `${nsid} missing scopes`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe("parseXrpcNsid", () => {
  it("parses NSIDs from /xrpc paths", () => {
    expect(parseXrpcNsid("/xrpc/app.standard-reader.searchPublications")).toBe(
      "app.standard-reader.searchPublications",
    );
  });

  it("returns null for non-xrpc paths", () => {
    expect(parseXrpcNsid("/api/extension/resolve")).toBeNull();
    expect(parseXrpcNsid("/xrpc/")).toBeNull();
  });
});
