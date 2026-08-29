import { describe, expect, it } from "vitest";

import { XRPC_EXAMPLE_PLAN } from "../../../../../examples/xrpc-client/src/plan.generated";
import { buildXrpcExamplePlan } from "../../../scripts/lib/build-xrpc-example-plan";

describe("examples/xrpc-client conformance plan", () => {
  it("is up to date with the API docs catalog", () => {
    // The example client is what proves the XRPC surface works end to end. If
    // the checked-in plan drifts from the catalog, a method stops being
    // exercised and nothing else notices.
    expect(
      XRPC_EXAMPLE_PLAN,
      "run `pnpm --filter standard-reader xrpc:example-plan`",
    ).toEqual(buildXrpcExamplePlan());
  });
});
