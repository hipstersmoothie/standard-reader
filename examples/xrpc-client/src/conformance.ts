/**
 * Exercises every XRPC method Standard Reader serves, against a real
 * deployment, as a real signed-in caller.
 *
 * Writes are paired with the procedure that undoes them, so a run leaves the
 * account as it found it. Procedures with no inverse are skipped unless asked
 * for.
 */

import type { StandardReaderClient } from "./client";
import type { Fixtures } from "./fixtures";
import { resolveArgs } from "./fixtures";
import { XRPC_EXAMPLE_PLAN } from "./plan.generated";
import type { XrpcExampleMethod } from "./types";

export type CheckStatus = "fail" | "pass" | "skip";

export type Check = {
  detail?: string;
  nsid: string;
  status: CheckStatus;
};

export type RunOptions = {
  includeDestructive?: boolean;
};

function describe(result: {
  body: unknown;
  raw: string;
  status: number;
}): string {
  const error =
    (result.body as { error?: string; message?: string } | null) ?? {};
  const summary = error.error
    ? `${error.error}: ${error.message ?? ""}`
    : result.raw.slice(0, 160);
  return `${result.status} ${summary}`.trim();
}

async function callMethod(
  client: StandardReaderClient,
  entry: XrpcExampleMethod,
  fixtures: Fixtures,
): Promise<Check> {
  const params = resolveArgs(entry.params, fixtures);
  const body = resolveArgs(entry.body, fixtures);
  const missing = [...new Set([...params.missing, ...body.missing])];
  if (missing.length > 0) {
    return {
      nsid: entry.nsid,
      status: "skip",
      detail: `no fixture for ${missing.join(", ")}`,
    };
  }

  const result = await client.call(entry.nsid, {
    method: entry.kind === "procedure" ? "POST" : "GET",
    params: params.value as Record<string, string> | undefined,
    body: entry.kind === "procedure" ? (body.value ?? {}) : undefined,
  });

  return result.ok
    ? { nsid: entry.nsid, status: "pass" }
    : { nsid: entry.nsid, status: "fail", detail: describe(result) };
}

/**
 * createList → updateList → deleteList, chained on the rkey the first call
 * returns. Nothing else can exercise `updateList`/`deleteList` honestly: a
 * hard-coded rkey either does not exist or belongs to something real.
 */
async function runListLifecycle(
  client: StandardReaderClient,
  fixtures: Fixtures,
): Promise<Array<Check>> {
  const publicationUri = fixtures.publicationUri;
  if (!publicationUri) {
    return ["createList", "updateList", "deleteList"].map((name) => ({
      nsid: `app.standard-reader.${name}`,
      status: "skip" as const,
      detail: "no fixture for publicationUri",
    }));
  }

  const created = await client.call("app.standard-reader.createList", {
    method: "POST",
    body: {
      name: "XRPC conformance run",
      description: "Created and deleted by examples/xrpc-client.",
      publications: [publicationUri],
    },
  });
  if (!created.ok) {
    return [
      {
        nsid: "app.standard-reader.createList",
        status: "fail",
        detail: describe(created),
      },
      ...["updateList", "deleteList"].map((name) => ({
        nsid: `app.standard-reader.${name}`,
        status: "skip" as const,
        detail: "createList failed",
      })),
    ];
  }

  const uri = (created.body as { uri?: string } | null)?.uri ?? "";
  const rkey = uri.split("/").pop() ?? "";
  const checks: Array<Check> = [
    { nsid: "app.standard-reader.createList", status: "pass" },
  ];
  if (!rkey) {
    checks.push({
      nsid: "app.standard-reader.updateList",
      status: "fail",
      detail: `createList returned no usable uri: ${created.raw.slice(0, 160)}`,
    });
    return checks;
  }

  const updated = await client.call("app.standard-reader.updateList", {
    method: "POST",
    body: {
      rkey,
      name: "XRPC conformance run (updated)",
      publications: [publicationUri],
    },
  });
  checks.push(
    updated.ok
      ? { nsid: "app.standard-reader.updateList", status: "pass" }
      : {
          nsid: "app.standard-reader.updateList",
          status: "fail",
          detail: describe(updated),
        },
  );

  const deleted = await client.call("app.standard-reader.deleteList", {
    method: "POST",
    body: { rkey },
  });
  checks.push(
    deleted.ok
      ? { nsid: "app.standard-reader.deleteList", status: "pass" }
      : {
          nsid: "app.standard-reader.deleteList",
          status: "fail",
          detail: describe(deleted),
        },
  );
  return checks;
}

export async function runConformance(
  client: StandardReaderClient,
  fixtures: Fixtures,
  options: RunOptions = {},
): Promise<Array<Check>> {
  const byNsid = new Map(XRPC_EXAMPLE_PLAN.map((entry) => [entry.nsid, entry]));
  const checks: Array<Check> = [];
  let listLifecycleDone = false;

  for (const entry of XRPC_EXAMPLE_PLAN) {
    if (entry.role === "chained") {
      if (listLifecycleDone) continue;
      listLifecycleDone = true;
      checks.push(...(await runListLifecycle(client, fixtures)));
      continue;
    }

    if (entry.role === "destructive" && !options.includeDestructive) {
      checks.push({
        nsid: entry.nsid,
        status: "skip",
        detail: "no inverse; pass --include-destructive to run it",
      });
      continue;
    }

    // An `un*` procedure runs as the undo half of its pair, right after the
    // call that created the state it removes.
    if (entry.role === "undo") continue;

    checks.push(await callMethod(client, entry, fixtures));

    const undo = entry.undo ? byNsid.get(entry.undo) : undefined;
    if (undo) {
      checks.push(await callMethod(client, undo, fixtures));
    }
  }

  return checks.toSorted((a, b) => a.nsid.localeCompare(b.nsid));
}

/** Every method in the plan must appear in the results exactly once. */
export function coverageGaps(checks: Array<Check>): Array<string> {
  const seen = new Set(checks.map((check) => check.nsid));
  return XRPC_EXAMPLE_PLAN.map((entry) => entry.nsid).filter(
    (nsid) => !seen.has(nsid),
  );
}
