import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { kosyncBaseUrl, opdsShelfUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import {
  getAtprotoSessionForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import { kosyncKeyForDid, newKosyncSalt } from "#/server/kosync/credentials";
import { observe } from "#/server/observability/log";

/**
 * The three values a reader needs to connect an e-reader.
 *
 * A server function rather than a client-side derivation because the sync key
 * is an HMAC under a server secret (see `server/kosync/credentials.ts`) — the
 * key is the whole reason this cannot be computed in the browser.
 */
export interface EreaderConnection {
  /** OPDS catalog URL carrying this reader's shelves. */
  catalogUrl: string;
  /** Base URL for KOReader's "Custom sync server". */
  kosyncUrl: string;
  /** What to type as the kosync username — their handle, or DID as a fallback. */
  username: string;
  /** What to type as the kosync password. */
  syncKey: string;
}

const getEreaderConnection = createServerFn({ method: "GET" }).handler(
  observe("ereader.getConnection", async (_, span) => {
    const did = await getReaderDidForRequest(getRequest());
    if (!did) return null;
    span.set("did", did);

    const [[profile], [account]] = await Promise.all([
      db
        .select({ handle: schema.profiles.handle })
        .from(schema.profiles)
        .where(eq(schema.profiles.did, did))
        .limit(1),
      db
        .select({ salt: schema.user.kosyncKeySalt })
        .from(schema.user)
        .where(eq(schema.user.did, did))
        .limit(1),
    ]);

    const baseUrl = getPublicUrl();
    return {
      catalogUrl: opdsShelfUrl(baseUrl, did),
      kosyncUrl: kosyncBaseUrl(baseUrl),
      syncKey: kosyncKeyForDid(did, account?.salt ?? null),
      // The handle is friendlier to type on a device keyboard, but a reader
      // whose profile has not been backfilled yet still needs something that
      // works — and the DID always resolves.
      username: profile?.handle ?? did,
    } satisfies EreaderConnection;
  }),
);

function getEreaderConnectionQueryOptions() {
  return queryOptions({
    queryFn: async () => getEreaderConnection(),
    queryKey: ["reader", "ereaderConnection"] as const,
    refetchOnWindowFocus: false,
    // Derived from the reader's DID and a server secret — it does not change
    // between sessions, so there is nothing to poll for.
    staleTime: 60 * 60_000,
  });
}

/**
 * Retire this reader's sync key and issue a new one.
 *
 * Writing a fresh salt is the whole rotation: the key is derived from it and
 * never stored, so the old one stops authenticating the moment this lands.
 * Reading positions are keyed by document hash rather than by credential, so
 * nothing a device already synced is lost — those devices just have to be given
 * the new key before they sync again.
 */
const rotateKosyncKey = createServerFn({ method: "POST" }).handler(
  observe("ereader.rotateKosyncKey", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) {
      throw new Error("Sign in to rotate your sync key.");
    }
    span.set("did", session.did);

    await db
      .update(schema.user)
      .set({ kosyncKeySalt: newKosyncSalt() })
      .where(eq(schema.user.did, session.did));

    return { ok: true as const };
  }),
);

function rotateKosyncKeyMutationOptions() {
  return mutationOptions({
    mutationFn: async () => rotateKosyncKey(),
    mutationKey: ["reader", "rotateKosyncKey"] as const,
  });
}

export const ereaderApi = {
  getEreaderConnection,
  getEreaderConnectionQueryOptions,
  rotateKosyncKey,
  rotateKosyncKeyMutationOptions,
};
