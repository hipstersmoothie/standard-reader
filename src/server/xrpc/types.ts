import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import type { XrpcAuthContext } from "./auth";

export type { XrpcAuthContext };

export type XrpcQueryParams = Record<string, string | undefined>;

export type XrpcRequestContext = {
  request: Request;
  auth: XrpcAuthContext | null;
  db: Db;
  schema: Schema;
  trackReadingEnabled: boolean;
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
