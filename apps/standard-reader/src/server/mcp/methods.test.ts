import { describe, expect, it } from "vitest";

import { XRPC_REGISTRY } from "#/server/xrpc/registry";

import { PROCEDURE, QUERY } from "./methods";

describe("MCP method constants", () => {
  it("only names methods the XRPC registry actually serves", () => {
    for (const nsid of [...Object.values(QUERY), ...Object.values(PROCEDURE)]) {
      expect(XRPC_REGISTRY.has(nsid), `${nsid} is not registered`).toBe(true);
    }
  });

  it("classifies queries and procedures the way the tools call them", () => {
    for (const nsid of Object.values(QUERY)) {
      expect(XRPC_REGISTRY.get(nsid)?.method, nsid).toBe("query");
    }
    for (const nsid of Object.values(PROCEDURE)) {
      expect(XRPC_REGISTRY.get(nsid)?.method, nsid).toBe("procedure");
    }
  });

  it("exposes every write procedure the API offers except labeler config", () => {
    const registeredProcedures = [...XRPC_REGISTRY.entries()]
      .filter(([, entry]) => entry.method === "procedure")
      .map(([nsid]) => nsid);
    const exposed = new Set<string>(Object.values(PROCEDURE));
    const missing = registeredProcedures.filter((nsid) => !exposed.has(nsid));

    // Labeler subscription management is deliberately out of scope for a model:
    // it is moderation configuration, and belongs in the app's settings UI.
    expect(missing.toSorted()).toEqual([
      "app.standard-reader.subscribeLabeler",
      "app.standard-reader.unsubscribeLabeler",
    ]);
  });
});
