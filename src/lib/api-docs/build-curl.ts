import type { ApiDocsCatalogEntry } from "./catalog";
import type { ApiDocsFixtures } from "./fixture-defaults";

import { getDefaultApiDocsFixtures } from "./fixture-defaults";

export function resolveApiDocsExampleParams(
  entry: ApiDocsCatalogEntry,
  fixtures: ApiDocsFixtures = getDefaultApiDocsFixtures(),
): Record<string, string> {
  const params = entry.example.params;
  if (typeof params === "function") {
    return params(fixtures);
  }
  return params ?? {};
}

export function resolveApiDocsExampleBody(
  entry: ApiDocsCatalogEntry,
  fixtures: ApiDocsFixtures = getDefaultApiDocsFixtures(),
): unknown | undefined {
  const body = entry.example.body;
  if (typeof body === "function") {
    return body(fixtures);
  }
  return body;
}

export function buildApiDocsCurl(
  entry: ApiDocsCatalogEntry,
  baseUrl: string,
  fixtures: ApiDocsFixtures = getDefaultApiDocsFixtures(),
  options?: {
    params?: Record<string, string>;
    body?: unknown;
    /** Show Bearer placeholder for OAuth-protected examples. */
    bearerPlaceholder?: boolean;
  },
): string {
  const params =
    options?.params ?? resolveApiDocsExampleParams(entry, fixtures);
  const body = options?.body ?? resolveApiDocsExampleBody(entry, fixtures);
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/xrpc/${entry.nsid}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const authFlag = options?.bearerPlaceholder
    ? " -H 'Authorization: Bearer $ACCESS_TOKEN'"
    : "";
  if (entry.method === "query") {
    return `curl -sS${authFlag} '${url.toString()}'`;
  }
  const json = JSON.stringify(body ?? {}, null, 0);
  return `curl -sS -X POST${authFlag} '${url.toString()}' -H 'Content-Type: application/json' -d '${json}'`;
}
