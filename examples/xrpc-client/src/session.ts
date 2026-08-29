/**
 * Logging in. An app password is the shortest path for a script; a real
 * end-user integration would use OAuth (see README).
 */

import { resolveHandle, resolvePds } from "./identity";

export type Session = {
  accessJwt: string;
  did: string;
  handle: string;
  pds: string;
};

export async function login(
  identifier: string,
  password: string,
): Promise<Session> {
  const did = await resolveHandle(identifier);
  const pds = await resolvePds(did);
  const response = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const payload = (await response.json()) as {
    accessJwt?: string;
    did?: string;
    handle?: string;
    message?: string;
  };
  if (!response.ok || !payload.accessJwt || !payload.did) {
    throw new Error(
      `createSession failed at ${pds}: ${response.status} ${payload.message ?? ""}`,
    );
  }
  return {
    accessJwt: payload.accessJwt,
    did: payload.did,
    handle: payload.handle ?? identifier,
    pds,
  };
}

/**
 * Mint an inter-service auth token for one call — the same credential a PDS
 * signs on your behalf when you use the `atproto-proxy` header, but obtained
 * explicitly so a client can call the AppView without proxying.
 */
export async function mintServiceJwt(
  session: Session,
  audience: string,
  lxm: string,
): Promise<string> {
  const url = new URL("/xrpc/com.atproto.server.getServiceAuth", session.pds);
  url.searchParams.set("aud", audience);
  url.searchParams.set("lxm", lxm);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  const payload = (await response.json()) as {
    message?: string;
    token?: string;
  };
  if (!response.ok || !payload.token) {
    throw new Error(
      `getServiceAuth failed: ${response.status} ${payload.message ?? ""}`,
    );
  }
  return payload.token;
}
