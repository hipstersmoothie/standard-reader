import { describe, expect, it } from "vitest";

import { dispatchXrpc } from "./dispatch";
import { readJsonBody, xrpcQueryRequest } from "./test/helpers";

const runIntegration = process.env.XRPC_INTEGRATION_TEST === "1";

describe.skipIf(!runIntegration)("XRPC integration", () => {
  it("searchPublications returns a stable cursor page shape", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.searchPublications", {
        q: "reader",
        limit: "2",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await readJsonBody<{
      query: string;
      cursor: string | null;
      items: Array<{ uri: string; name: string }>;
    }>(response);

    expect(body.query).toBe("reader");
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(item.uri).toMatch(/^at:\/\//);
      expect(typeof item.name).toBe("string");
    }
  });

  it("getPublications returns publication views", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.getPublications", {
        limit: "2",
        sort: "readers",
      }),
    );

    expect(response.status).toBe(200);
    const body = await readJsonBody<{
      items: Array<{ uri: string; subscriberCount: number }>;
      cursor: string | null;
    }>(response);

    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(item.uri).toMatch(/^at:\/\//);
      expect(typeof item.subscriberCount).toBe("number");
    }
  });
});
