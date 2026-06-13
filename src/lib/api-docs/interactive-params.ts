import type { ApiDocsCatalogEntry } from "./catalog";

export type ApiDocsParamControl =
  | {
      kind: "input";
      param: string;
      label?: string;
      placeholder?: string;
    }
  | {
      kind: "select";
      param: string;
      label?: string;
      /** Resolved server-side (popular document tags). */
      optionsSource: "tags";
    };

const input = (
  param: string,
  label?: string,
  placeholder?: string,
): ApiDocsParamControl => ({
  kind: "input",
  param,
  label,
  placeholder,
});

const GET_INPUTS: Partial<Record<string, Array<ApiDocsParamControl>>> = {
  "app.standard-reader.getPublication": [input("publication", "publication")],
  "app.standard-reader.getDocument": [input("document", "document")],
  "app.standard-reader.getAuthor": [input("did", "did")],
  "app.standard-reader.getAuthorPublications": [input("did", "did")],
  "app.standard-reader.getList": [input("list", "list")],
  "app.standard-reader.getListFeed": [input("list", "list")],
  "app.standard-reader.getDocumentContext": [input("document", "document")],
  "app.standard-reader.getTagFeed": [
    { kind: "select", param: "tag", label: "tag", optionsSource: "tags" },
  ],
  "app.standard-reader.getFollowStatus": [
    input("publication", "publication"),
    input("did", "did"),
  ],
  "app.standard-reader.getReadStatus": [
    input("document", "document"),
    input("did", "did"),
  ],
  "app.standard-reader.getBookmarkStatus": [
    input("document", "document"),
    input("did", "did"),
  ],
  "app.standard-reader.getRecommendStatus": [
    input("document", "document"),
    input("did", "did"),
  ],
  "app.standard-reader.getSaved": [input("did", "did")],
  "app.standard-reader.getReadingHistory": [input("did", "did")],
  "app.standard-reader.getLikes": [input("did", "did")],
};

export const API_DOCS_INTERACTIVE: Partial<
  Record<string, Array<ApiDocsParamControl>>
> = {
  "app.standard-reader.resolveUrl": [input("url", "url", "https://…")],
  "app.standard-reader.resolveHandle": [
    input("handle", "publication", "rockstar.l7y.media"),
  ],
  "app.standard-reader.searchPublications": [input("q", "q", "search query")],
  "app.standard-reader.searchDocuments": [input("q", "q", "search query")],
  ...GET_INPUTS,
};

/** Params the user can edit in the curl panel for this endpoint. */
export function apiDocsParamControls(
  entry: ApiDocsCatalogEntry,
  signedIn: boolean,
): Array<ApiDocsParamControl> {
  const controls = API_DOCS_INTERACTIVE[entry.nsid];
  if (!controls) return [];
  if (!signedIn) return controls;
  return controls.filter((control) => control.param !== "did");
}

export function apiDocsUsesSessionAuth(entry: ApiDocsCatalogEntry): boolean {
  return entry.auth === "required" || entry.method === "procedure";
}
