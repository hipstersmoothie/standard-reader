/**
 * Writes the example client's conformance plan. See
 * `scripts/lib/build-xrpc-example-plan.ts` for why it is generated.
 *
 *   pnpm --filter standard-reader xrpc:example-plan
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { renderXrpcExamplePlan } from "./lib/build-xrpc-example-plan";

const target = path.join(
  process.cwd(),
  "../../examples/xrpc-client/src/plan.generated.ts",
);

fs.writeFileSync(target, renderXrpcExamplePlan(), "utf8");
// The file is committed, so it has to satisfy `pnpm format:check` like any
// other source. Format it here rather than leaving a dirty tree behind.
execFileSync(path.join(process.cwd(), "../../node_modules/.bin/oxfmt"), [
  target,
]);
console.log(`Wrote ${path.relative(process.cwd(), target)}`);
