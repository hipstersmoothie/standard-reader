import type { ApiDocsCatalogEntry } from "./catalog";
import type { ApiDocsFixtures } from "./fixture-defaults";

import {
  resolveApiDocsExampleBody,
  resolveApiDocsExampleParams,
} from "./build-curl";

export function mergeApiDocsExampleParams(
  entry: ApiDocsCatalogEntry,
  fixtures: ApiDocsFixtures,
  overrides: Record<string, string>,
): Record<string, string> {
  return {
    ...resolveApiDocsExampleParams(entry, fixtures),
    ...overrides,
  };
}

export function mergeApiDocsExampleBody(
  entry: ApiDocsCatalogEntry,
  fixtures: ApiDocsFixtures,
  overrides: Record<string, unknown> | undefined,
): unknown | undefined {
  const base = resolveApiDocsExampleBody(entry, fixtures);
  if (!overrides || Object.keys(overrides).length === 0) {
    return base;
  }
  if (typeof base === "object" && base !== null && !Array.isArray(base)) {
    return { ...(base as Record<string, unknown>), ...overrides };
  }
  return overrides;
}
