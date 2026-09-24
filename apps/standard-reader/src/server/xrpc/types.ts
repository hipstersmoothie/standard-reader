import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";

import type { XrpcAuthContext } from "./auth";

export type { XrpcAuthContext };

export type XrpcQueryParams = Record<string, string | undefined>;

export type XrpcRequestContext = {
  request: Request;
  auth: XrpcAuthContext | null;
  db: Db;
  schema: Schema;
  trackReadingEnabled: boolean;
  countOldPostsAsUnreadEnabled: boolean;
  /**
   * How much of Bridgy Fed this request hides — see `BridgeExclusion`.
   *
   * `"all"` for an anonymous caller, matching the signed-out app. A caller who
   * authenticated — with a cookie session or a DID token — gets their own
   * "Hide mirrored websites" setting instead, which covers the web bridge only
   * and is off by default.
   */
  excludeBridged: BridgeExclusion;
  /** Parsed query-string parameters (queries only). */
  params: XrpcQueryParams;
  /** Parsed JSON body (procedures only). */
  body: unknown;
};

export type XrpcHandler = (ctx: XrpcRequestContext) => Promise<unknown>;

export type XrpcAuthMode = "none" | "required" | "optional-did";

export type XrpcRegistryEntry = {
  method: "query" | "procedure";
  auth: XrpcAuthMode;
  scopes?: Array<string>;
  handler: XrpcHandler;
};
