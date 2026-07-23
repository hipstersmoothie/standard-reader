import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "./errors";
import {
  intParam,
  parseQueryParams,
  requireBodyField,
  requireParam,
} from "./params";
import { xrpcProcedureRequest } from "./test/helpers";

describe("XRPC params", () => {
  it("parseQueryParams collects search params", () => {
    const url = new URL(
      "http://127.0.0.1/xrpc/app.standard-reader.searchDocuments?q=reader&limit=5",
    );
    expect(parseQueryParams(url)).toEqual({ q: "reader", limit: "5" });
  });

  it("requireParam rejects missing values", () => {
    expect(() => requireParam({}, "q")).toThrow(InvalidRequestError);
    expect(() => requireParam({ q: "  " }, "q")).toThrow(InvalidRequestError);
  });

  it("intParam validates bounds", () => {
    expect(intParam({ limit: "10" }, "limit", 5, { min: 1, max: 50 })).toBe(10);
    expect(() =>
      intParam({ limit: "0" }, "limit", 5, { min: 1, max: 50 }),
    ).toThrow(InvalidRequestError);
    expect(() =>
      intParam({ limit: "nope" }, "limit", 5, { min: 1, max: 50 }),
    ).toThrow(InvalidRequestError);
  });

  it("requireBodyField rejects missing procedure fields", () => {
    expect(() => requireBodyField({}, "publication")).toThrow(
      InvalidRequestError,
    );
    expect(() => requireBodyField({ publication: "" }, "publication")).toThrow(
      InvalidRequestError,
    );
  });
});

describe("parseProcedureBody", () => {
  it("requires JSON object bodies", async () => {
    const { parseProcedureBody } = await import("./params");

    await expect(
      parseProcedureBody(
        new Request("http://127.0.0.1/xrpc/app.standard-reader.markRead", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        }),
      ),
    ).rejects.toThrow(InvalidRequestError);

    await expect(
      parseProcedureBody(
        xrpcProcedureRequest("app.standard-reader.markRead", []),
      ),
    ).rejects.toThrow(InvalidRequestError);
  });
});
