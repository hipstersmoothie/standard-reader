/**
 * Read a publication's permissioned space and reduce it to desired mirror rows.
 * Orchestration only (auth + credential flow + paging + pure reconcile); the
 * reconcile itself lives in `sync.ts` and is unit-tested. Verified end-to-end
 * against a live HappyView instance.
 */

import type { Did } from "@atcute/lexicons";

import { atprotoOAuth } from "../../integrations/auth/atproto.server";
import { bearerTransport, dpopTransport } from "./client";
import type { DpopFetch } from "./client";
import type { HappyViewConfig } from "./config";
import { spaceUri } from "./space-uri";
import { getDelegationToken, getSpaceCredential, listRepoOps } from "./spaces";
import type { RepoOp } from "./spaces";
import { reconcileSpaceOps } from "./sync";
import type { DesiredSubscriber } from "./sync";

/** Author DID + rkey out of a publication AT-URI (`at://<did>/<coll>/<rkey>`). */
function publicationParts(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}

/** Adapt an atcute OAuth session into a DPoP-signing fetch for absolute URLs. */
function dpopFetchFromSession(session: {
  handle: (pathname: string, init?: RequestInit) => Promise<Response>;
}): DpopFetch {
  // `handle` resolves the URL as `new URL(pathname, aud)`; an absolute URL
  // overrides the PDS base, so we hand it the full HappyView URL and it signs a
  // DPoP proof with `htu` = that URL plus the user's access token.
  return (url, init) =>
    session.handle(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
}

/**
 * Resolve the publication's space, mint a 2h read credential via the author's
 * session, page every record op, and reconcile to desired mirror rows. Returns
 * null when the author has no restorable session (can't mint a credential).
 */
export async function readSpaceForPublication(
  publicationUri: string,
  config: HappyViewConfig,
): Promise<Array<DesiredSubscriber> | null> {
  const parts = publicationParts(publicationUri);
  if (!parts) return null;

  const ref = { did: parts.did, type: config.spaceType, skey: parts.rkey };
  const uri = spaceUri(ref);

  let session: {
    handle: (pathname: string, init?: RequestInit) => Promise<Response>;
  } | null = null;
  try {
    session = await atprotoOAuth.restore(parts.did as Did);
  } catch {
    session = null;
  }
  if (!session) return null;

  const dpop = dpopTransport(dpopFetchFromSession(session));
  const delegation = await getDelegationToken(dpop, config, uri);
  const credential = await getSpaceCredential(
    dpop,
    config,
    delegation.delegationToken,
  );
  const bearer = bearerTransport();
  const auth = { kind: "bearer" as const, credential: credential.credential };

  const ops: Array<RepoOp> = [];
  let cursor: string | undefined;
  do {
    const page = await listRepoOps(bearer, config, auth, {
      space: uri,
      limit: 100,
      cursor,
    });
    ops.push(...page.ops);
    cursor = page.cursor;
  } while (cursor);

  return reconcileSpaceOps(ops, ref);
}
