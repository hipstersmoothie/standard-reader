import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  getAtprotoSessionForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import {
  SIDEBAR_PREF_RKEY,
  putSidebarPrefRecord,
} from "#/server/atproto/repo-records";
import { upsertSidebarPref } from "#/server/ingest/handlers";
import { observe } from "#/server/observability/log";
import { loadSidebarPref } from "#/server/reader/shell-snapshot.server";

/**
 * Reader sidebar preferences (`app.standard-reader.sidebarPref`) — the display
 * order of the reader's list groups and which groups are collapsed. A singleton
 * record (rkey `self`) per reader, mirrored into `sidebar_prefs` so the shell
 * reads it without PDS I/O; writes go through to the mirror immediately.
 */

/** Ordering + collapsed state for the sidebar's list groups. */
export interface SidebarPref {
  /** Ordered at-uris of the reader's list groups (own + saved). */
  listOrder: Array<string>;
  /** At-uris of the list groups the reader has collapsed. */
  collapsed: Array<string>;
}

const putSidebarPrefInput = z.object({
  listOrder: z.array(z.string().min(1)).max(1000).default([]),
  collapsed: z.array(z.string().min(1)).max(1000).default([]),
});

const getSidebarPref = createServerFn({ method: "GET" }).handler(
  observe("sidebarPref.get", async (_, span) => {
    // DID-only lookup (no PDS client restore) — preferences are DB data.
    const did = await getReaderDidForRequest(getRequest());
    if (!did) {
      return { listOrder: [], collapsed: [] } satisfies SidebarPref;
    }
    span.set("did", did);
    const pref = await loadSidebarPref(did);
    span.set("order", pref.listOrder.length);
    span.set("collapsed", pref.collapsed.length);
    return pref;
  }),
);

const putSidebarPref = createServerFn({ method: "POST" })
  .validator(putSidebarPrefInput)
  .handler(
    observe("sidebarPref.put", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to save sidebar preferences.");
      }
      span.set("did", session.did);
      span.set("order", data.listOrder.length);
      span.set("collapsed", data.collapsed.length);

      const updatedAt = new Date().toISOString();
      const { uri, cid } = await putSidebarPrefRecord(
        session.client,
        session.did,
        {
          listOrder: data.listOrder,
          collapsed: data.collapsed,
          updatedAt,
        },
      );
      // Write through to the DB mirror so the read path sees the change
      // immediately, without waiting for the tap to deliver the event.
      await upsertSidebarPref(uri, session.did, SIDEBAR_PREF_RKEY, cid, {
        listOrder: data.listOrder,
        collapsed: data.collapsed,
        updatedAt,
      });
      return { ok: true as const };
    }),
  );

function getSidebarPrefQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "sidebarPref"] as const,
    queryFn: async () => getSidebarPref(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function putSidebarPrefMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "putSidebarPref"] as const,
    mutationFn: async (input: z.input<typeof putSidebarPrefInput>) =>
      putSidebarPref({ data: input }),
  });
}

export const sidebarPrefApi = {
  getSidebarPref,
  getSidebarPrefQueryOptions,
  putSidebarPref,
  putSidebarPrefMutationOptions,
};
