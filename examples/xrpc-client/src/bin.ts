/**
 * A tiny Standard Reader client you can run.
 *
 *   pnpm --filter @standard-reader/example-xrpc-client start conformance
 *   pnpm --filter @standard-reader/example-xrpc-client start transports
 *   pnpm --filter @standard-reader/example-xrpc-client start call app.standard-reader.getLatestFeed limit=3
 *
 * Credentials come from the environment:
 *   STANDARD_READER_IDENTIFIER   handle or DID
 *   STANDARD_READER_APP_PASSWORD app password (Settings → App Passwords)
 * `PERF_TEST_IDENTIFIER` / `PERF_TEST_APP_PASSWORD` also work, so the runner
 * picks up this repo's existing apps/standard-reader/.env.
 */

import process from "node:process";

import { StandardReaderClient } from "./client";
import type { Transport } from "./client";
import { runConformance, coverageGaps } from "./conformance";
import { discoverFixtures } from "./fixtures";
import { resolveAppview } from "./identity";
import { login } from "./session";
import { runTransportProbe } from "./transports";

const APPVIEW = process.env.EXAMPLE_APPVIEW ?? "https://standard-reader.app";

function credentials(): { identifier: string; password: string } {
  const identifier =
    process.env.STANDARD_READER_IDENTIFIER ?? process.env.PERF_TEST_IDENTIFIER;
  const password =
    process.env.STANDARD_READER_APP_PASSWORD ??
    process.env.PERF_TEST_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error(
      "Set STANDARD_READER_IDENTIFIER and STANDARD_READER_APP_PASSWORD (or the PERF_TEST_* equivalents).",
    );
  }
  return { identifier, password };
}

const ICON = { fail: "FAIL", pass: "PASS", skip: "SKIP" } as const;

function report(
  title: string,
  checks: Array<{
    detail?: string;
    name?: string;
    nsid?: string;
    status: keyof typeof ICON;
  }>,
): number {
  console.log(`\n${title}`);
  for (const check of checks) {
    const label = check.nsid ?? check.name ?? "";
    console.log(
      `  ${ICON[check.status]}  ${label}${check.detail ? ` — ${check.detail}` : ""}`,
    );
  }
  const failed = checks.filter((check) => check.status === "fail").length;
  const skipped = checks.filter((check) => check.status === "skip").length;
  console.log(
    `  ${checks.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`,
  );
  return failed;
}

async function main(): Promise<void> {
  const [command = "all", ...rest] = process.argv.slice(2);
  const includeDestructive = rest.includes("--include-destructive");

  const appview = await resolveAppview(APPVIEW);
  const { identifier, password } = credentials();
  const session = await login(identifier, password);
  console.log(
    `AppView ${appview.did} at ${appview.serviceEndpoint}\nSigned in as ${session.handle} (${session.did}) via ${session.pds}`,
  );

  const clients = Object.fromEntries(
    (["direct", "proxy", "serviceAuth"] as const).map((transport) => [
      transport,
      new StandardReaderClient(appview, session, transport),
    ]),
  ) as Record<Transport, StandardReaderClient>;

  if (command === "call") {
    const positional = rest.filter((arg) => !arg.startsWith("--"));
    const nsid = positional[0];
    const args = positional.slice(1);
    if (!nsid) throw new Error("usage: call <nsid> [key=value …]");
    const params = Object.fromEntries(
      args.map((arg) => {
        const index = arg.indexOf("=");
        return [arg.slice(0, index), arg.slice(index + 1)];
      }),
    );
    const transport = (rest
      .find((arg) => arg.startsWith("--transport="))
      ?.split("=")[1] ?? "direct") as Transport;
    const result = await clients[transport].call(nsid, { params });
    console.log(result.status, JSON.stringify(result.body, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  const fixtures = await discoverFixtures(clients.direct, session.did);
  console.log(
    `Fixtures: ${Object.entries(fixtures)
      .map(([key, value]) => `${key}=${value ?? "—"}`)
      .join(" ")}`,
  );

  let failed = 0;

  if (command === "all" || command === "transports") {
    failed += report(
      "Transports (the credential must actually authenticate)",
      await runTransportProbe(clients, fixtures),
    );
  }

  if (command === "all" || command === "conformance") {
    const checks = await runConformance(clients.direct, fixtures, {
      includeDestructive,
    });
    failed += report("Conformance (every method, direct transport)", checks);
    const gaps = coverageGaps(checks);
    if (gaps.length > 0) {
      failed += 1;
      console.log(`  FAIL  never exercised: ${gaps.join(", ")}`);
    }
  }

  if (failed > 0) process.exitCode = 1;
}

await main();
