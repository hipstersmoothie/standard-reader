/**
 * Typed wrappers over HappyView's permissioned-space XRPC (Proposal 0016).
 * Prefers the stable `com.atproto.space.*` / `com.atproto.simplespace.*`
 * namespaces over the `dev.happyview.space.*` aliases (removed at v3).
 *
 * Each wrapper takes a `SpaceTransport` (DPoP for member/author actions, Bearer
 * for cross-service reads) and a config; it builds the request purely and
 * executes it. Shapes follow HappyView's documented request/response bodies.
 */

import { callHappyView, HappyViewError } from "./client";
import type { SpaceTransport } from "./client";
import type { HappyViewConfig } from "./config";
import { buildHappyViewRequest } from "./request";
import type { SpaceAuthMode } from "./request";

const NS = {
  createSpace: "com.atproto.simplespace.createSpace",
  createRecord: "com.atproto.space.createRecord",
  putRecord: "com.atproto.space.putRecord",
  deleteRecord: "com.atproto.space.deleteRecord",
  getRecord: "com.atproto.space.getRecord",
  listRepoOps: "com.atproto.space.listRepoOps",
  listRepos: "com.atproto.space.listRepos",
  getDelegationToken: "com.atproto.space.getDelegationToken",
  getSpaceCredential: "com.atproto.space.getSpaceCredential",
} as const;

export type MintPolicy = "member-list" | "public" | "managing-app";

export type AppAccess =
  | { type: "open" }
  | { type: "allowList"; allowed: Array<string> };

export interface CreateSpaceInput {
  type: string;
  skey: string;
  displayName?: string;
  description?: string;
  mintPolicy?: MintPolicy;
  appAccess?: AppAccess;
  managingAppDid?: string;
  /** When false, members can't enumerate the member list (only the author). */
  membershipPublic?: boolean;
  /** When false, records aren't world-readable — only via a space credential. */
  recordsPublic?: boolean;
}

/** Create a space (author's DPoP session). Returns the space URI. */
export function createSpace(
  transport: SpaceTransport,
  config: HappyViewConfig,
  input: CreateSpaceInput,
): Promise<{ uri: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.createSpace,
      method: "POST",
      body: input,
      auth: { kind: "dpop" },
    }),
  );
}

/**
 * Create the space if it doesn't already exist, tolerating a "already exists"
 * race/repeat so callers can treat it as ensure-style. Any other error
 * propagates.
 */
export async function ensureSpaceExists(
  transport: SpaceTransport,
  config: HappyViewConfig,
  input: CreateSpaceInput,
): Promise<void> {
  try {
    await createSpace(transport, config, input);
  } catch (error) {
    // HappyView returns a conflict (or a message saying so) when the space is
    // already there — that's success for an ensure. Re-throw anything else.
    const status = error instanceof HappyViewError ? error.status : undefined;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const alreadyExists =
      status === 409 ||
      message.includes("already exists") ||
      message.includes("already registered");
    if (!alreadyExists) throw error;
  }
}

/** Create a record in the caller's own repo in the space (auto TID rkey). */
export function createRecord(
  transport: SpaceTransport,
  config: HappyViewConfig,
  input: { space: string; collection: string; record: unknown },
): Promise<{ uri: string; cid: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.createRecord,
      method: "POST",
      body: input,
      auth: { kind: "dpop" },
    }),
  );
}

/** Upsert a record at a caller-supplied rkey (author's own repo). */
export function putRecord(
  transport: SpaceTransport,
  config: HappyViewConfig,
  input: {
    space: string;
    collection: string;
    rkey: string;
    record: unknown;
    swapRecord?: string;
  },
): Promise<{ uri: string; cid: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.putRecord,
      method: "POST",
      body: input,
      auth: { kind: "dpop" },
    }),
  );
}

/** Delete one of the caller's own records (DPoP identity required). */
export function deleteRecord(
  transport: SpaceTransport,
  config: HappyViewConfig,
  input: { space: string; collection: string; rkey: string },
): Promise<Record<string, never>> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.deleteRecord,
      method: "POST",
      body: input,
      auth: { kind: "dpop" },
    }),
  );
}

export interface RepoOp {
  id: string;
  rev: string;
  idx: number;
  action: "create" | "update" | "delete";
  collection: string;
  rkey: string;
  cid?: string;
  did: string;
  value?: unknown;
  createdAt: string;
}

/**
 * List record operations across the space with values inlined — the
 * sync-friendly read (avoids the listRecords → getRecord N+1). Bearer space
 * credential or a `read` member's DPoP session.
 */
export function listRepoOps(
  transport: SpaceTransport,
  config: HappyViewConfig,
  auth: SpaceAuthMode,
  params: { space: string; did?: string; limit?: number; cursor?: string },
): Promise<{ ops: Array<RepoOp>; cursor?: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.listRepoOps,
      method: "GET",
      params,
      auth,
    }),
  );
}

/** Read a single record (read member DPoP session or Bearer credential). */
export function getRecord(
  transport: SpaceTransport,
  config: HappyViewConfig,
  auth: SpaceAuthMode,
  params: { space: string; collection: string; rkey: string },
): Promise<{ uri: string; cid: string; value: unknown }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.getRecord,
      method: "GET",
      params,
      auth,
    }),
  );
}

/** List the authors (members) who have records in the space. */
export function listRepos(
  transport: SpaceTransport,
  config: HappyViewConfig,
  auth: SpaceAuthMode,
  params: { space: string },
): Promise<{ repos: Array<{ did: string; rev: string }> }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.listRepos,
      method: "GET",
      params,
      auth,
    }),
  );
}

/**
 * Step 1 of the cross-service read flow: a member mints a short-lived (60s)
 * delegation token proving membership (DPoP auth).
 */
export function getDelegationToken(
  transport: SpaceTransport,
  config: HappyViewConfig,
  space: string,
): Promise<{ delegationToken: string; expiresAt: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.getDelegationToken,
      method: "GET",
      params: { space },
      auth: { kind: "dpop" },
    }),
  );
}

/**
 * Step 2: exchange the delegation token for a 2-hour Bearer space credential
 * (DPoP auth; caller must be the token's subject). Any service can then read
 * the space with `Authorization: Bearer <credential>`.
 */
export function getSpaceCredential(
  transport: SpaceTransport,
  config: HappyViewConfig,
  delegationToken: string,
): Promise<{ credential: string; expiresAt: string }> {
  return callHappyView(
    transport,
    buildHappyViewRequest({
      config,
      nsid: NS.getSpaceCredential,
      method: "POST",
      body: { grant: delegationToken },
      auth: { kind: "dpop" },
    }),
  );
}
