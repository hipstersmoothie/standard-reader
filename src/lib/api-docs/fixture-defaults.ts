/** Default fixture values for API docs examples (client-safe). */
export type ApiDocsFixtures = {
  publicationUri: string;
  documentUri: string;
  handle: string;
  tag: string;
  searchQuery: string;
  readerDid: string;
  listUri: string;
  resolveUrl: string;
};

export function getDefaultApiDocsFixtures(): ApiDocsFixtures {
  return {
    publicationUri:
      "at://did:plc:example/site.standard.publication/abc",
    documentUri: "at://did:plc:example/site.standard.document/xyz",
    handle: "standard.site",
    tag: "reader",
    searchQuery: "reader",
    readerDid: "did:plc:example",
    listUri: "at://did:plc:example/app.standard-reader.list/abc",
    resolveUrl: "https://standard.site",
  };
}

/** Stable publication lookup for resolveHandle docs and examples. */
export const API_DOCS_RESOLVE_HANDLE_EXAMPLE = "rockstar.l7y.media";

/** Default lookup for resolveHandle examples (publication site domain). */
export function resolveHandleExampleFromFixtures(
  _fixtures: ApiDocsFixtures,
): string {
  return API_DOCS_RESOLVE_HANDLE_EXAMPLE;
}

const PLACEHOLDER_DID = "did:plc:example";

/** Whether fixtures still use scaffold placeholders (no env / DB discovery). */
export function isPlaceholderApiDocsFixture(
  fixtures: ApiDocsFixtures,
  field: keyof ApiDocsFixtures,
): boolean {
  const defaults = getDefaultApiDocsFixtures();
  const value = fixtures[field];
  const defaultValue = defaults[field];
  if (value === defaultValue) {
    return true;
  }
  if (typeof value === "string" && value.includes(PLACEHOLDER_DID)) {
    return true;
  }
  return false;
}
