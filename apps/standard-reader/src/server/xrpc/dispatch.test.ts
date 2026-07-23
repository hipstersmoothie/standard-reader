import { beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchXrpc } from "./dispatch";
import {
  readJsonBody,
  xrpcProcedureRequest,
  xrpcQueryRequest,
} from "./test/helpers";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getXrpcDbContext: vi.fn(async () => ({
      db: {},
      schema: {},
      trackReadingEnabled: false,
    })),
  };
});

describe("dispatchXrpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers OPTIONS with CORS preflight", async () => {
    const response = await dispatchXrpc(
      new Request(
        "http://127.0.0.1:3000/xrpc/app.standard-reader.searchPublications",
        {
          method: "OPTIONS",
        },
      ),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );
  });

  it("rejects invalid XRPC paths", async () => {
    const response = await dispatchXrpc(
      new Request("http://127.0.0.1:3000/not-xrpc"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ error: string }>(response);
    expect(body.error).toBe("InvalidRequest");
  });

  it("rejects unknown NSIDs", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.notReal"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/not found/i);
  });

  it("requires GET for queries", async () => {
    const response = await dispatchXrpc(
      new Request(
        "http://127.0.0.1:3000/xrpc/app.standard-reader.searchPublications?q=reader",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/GET/i);
  });

  it("requires POST for procedures", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.markRead", {
        document: "at://did:plc:ex/site.standard.document/abc",
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/POST/i);
  });

  it("returns 401 with WWW-Authenticate when auth is required", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.getHomeFeed"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    const body = await readJsonBody<{ error: string }>(response);
    expect(body.error).toBe("AuthenticationRequired");
  });

  it("returns 401 for write procedures without credentials", async () => {
    const response = await dispatchXrpc(
      xrpcProcedureRequest("app.standard-reader.followPublication", {
        publication: "at://did:plc:ex/site.standard.publication/abc",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing required query params", async () => {
    const response = await dispatchXrpc(
      xrpcQueryRequest("app.standard-reader.searchPublications"),
    );
    expect(response.status).toBe(400);
    const body = await readJsonBody<{ message: string }>(response);
    expect(body.message).toMatch(/Missing required parameter: q/);
  });

  it("returns 401 before validating procedure bodies when auth is required", async () => {
    const response = await dispatchXrpc(
      new Request("http://127.0.0.1:3000/xrpc/app.standard-reader.markRead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "[]",
      }),
    );
    expect(response.status).toBe(401);
  });
});
