/**
 * Generates the conformance plan shipped with `examples/xrpc-client`.
 *
 * The example client is deliberately an *outsider*: it imports nothing from
 * this app, exactly like the integrations that file interop bugs against us.
 * But a hand-maintained list of methods rots, and a plan that quietly stops
 * covering a method is how `atproto-proxy` stayed broken through two rounds of
 * "fixes". So the plan is generated from `API_DOCS_CATALOG` — which
 * `registry.test.ts` holds to full parity with `XRPC_REGISTRY` — and a test
 * fails when the checked-in file drifts.
 *
 * Fixture-dependent example arguments are emitted as `{{placeholder}}` tokens
 * that the example resolves from its own config at run time.
 */

import { API_DOCS_CATALOG } from "#/lib/api-docs/catalog";
import type { ApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import { getDefaultApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";

/**
 * Procedures that undo each other. The runner executes the pair back to back
 * so a conformance run leaves the account exactly as it found it.
 */
const UNDO_PAIRS: Record<string, string> = {
  "app.standard-reader.bookmarkDocument":
    "app.standard-reader.unbookmarkDocument",
  "app.standard-reader.followPublication":
    "app.standard-reader.unfollowPublication",
  "app.standard-reader.followUser": "app.standard-reader.unfollowUser",
  "app.standard-reader.markRead": "app.standard-reader.markUnread",
  "app.standard-reader.recommendDocument":
    "app.standard-reader.unrecommendDocument",
  "app.standard-reader.saveList": "app.standard-reader.unsaveList",
  "app.standard-reader.subscribeLabeler":
    "app.standard-reader.unsubscribeLabeler",
};

/**
 * Procedures with no inverse — they mutate state a conformance run cannot put
 * back. Only run with `--include-destructive`.
 */
const DESTRUCTIVE = new Set([
  "app.standard-reader.markAllRead",
  "app.standard-reader.markPublicationAllRead",
]);

/**
 * The list lifecycle needs the rkey the previous call returned, so the runner
 * drives these three as one chained step rather than from the plan's arguments.
 */
const LIST_LIFECYCLE = new Set([
  "app.standard-reader.createList",
  "app.standard-reader.deleteList",
  "app.standard-reader.updateList",
]);

export type XrpcExampleRole = "chained" | "destructive" | "primary" | "undo";

export type XrpcExampleMethod = {
  auth: "none" | "optional-did" | "required";
  body?: Record<string, unknown>;
  description: string;
  kind: "procedure" | "query";
  nsid: string;
  params?: Record<string, string>;
  role: XrpcExampleRole;
  section: string;
  undo?: string;
};

/** Fixture object whose every field reports itself as a `{{token}}`. */
function tokenFixtures(): ApiDocsFixtures {
  const keys = Object.keys(getDefaultApiDocsFixtures()) as Array<
    keyof ApiDocsFixtures
  >;
  return Object.fromEntries(
    keys.map((key) => [key, `{{${key}}}`]),
  ) as ApiDocsFixtures;
}

function roleFor(nsid: string, kind: "procedure" | "query"): XrpcExampleRole {
  if (kind === "query") return "primary";
  if (LIST_LIFECYCLE.has(nsid)) return "chained";
  if (DESTRUCTIVE.has(nsid)) return "destructive";
  if (Object.values(UNDO_PAIRS).includes(nsid)) return "undo";
  return "primary";
}

export function buildXrpcExamplePlan(): Array<XrpcExampleMethod> {
  const fixtures = tokenFixtures();

  return API_DOCS_CATALOG.filter((entry) => entry.status === "shipped")
    .map((entry): XrpcExampleMethod => {
      const example = entry.example;
      const params =
        typeof example.params === "function"
          ? example.params(fixtures)
          : example.params;
      const body =
        typeof example.body === "function"
          ? example.body(fixtures)
          : example.body;

      return {
        auth: entry.auth,
        ...(body ? { body } : {}),
        description: entry.description,
        kind: entry.method,
        nsid: entry.nsid,
        ...(params ? { params } : {}),
        role: roleFor(entry.nsid, entry.method),
        section: entry.section,
        ...(UNDO_PAIRS[entry.nsid] ? { undo: UNDO_PAIRS[entry.nsid] } : {}),
      };
    })
    .toSorted((a, b) => a.nsid.localeCompare(b.nsid));
}

export function renderXrpcExamplePlan(): string {
  const plan = buildXrpcExamplePlan();
  return `// GENERATED FILE — do not edit.
// Regenerate with: pnpm --filter standard-reader xrpc:example-plan
//
// Every XRPC method Standard Reader serves, with the example arguments its
// public API docs advertise. \`{{token}}\` values are resolved from the runner's
// fixtures (see src/fixtures.ts).

import type { XrpcExampleMethod } from "./types";

export const XRPC_EXAMPLE_PLAN: Array<XrpcExampleMethod> = ${JSON.stringify(
    plan,
    null,
    2,
  )};
`;
}
