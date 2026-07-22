// Registers the com.atproto.* lexicons so `com.atproto.repo.deleteRecord` is
// known to the atcute client type + runtime registry.
import "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getWriterSession } from "#/middleware/auth-session.server";

/** A publication owned by the signed-in author, shaped for the writer UI. */
export interface WriterPublication {
  uri: string;
  name: string;
  url: string;
  description: string | null;
  icon: string;
  discoverable: boolean;
  theme: {
    background: string;
    foreground: string;
    accent: string;
    accentForeground: string;
  };
}

export interface WriterDocument {
  uri: string;
  title: string;
  path: string | null;
  publishedAt: string;
  description: string | null;
  textContent: string | null;
  tags: Array<string> | null;
  siteUri: string;
}

/** Almanac fallbacks when a publication hasn't set an explicit theme. */
const THEME_FALLBACK = {
  background: "#fcf9f5",
  foreground: "#3e332e",
  accent: "#ad7f58",
  accentForeground: "#ffffff",
};

/**
 * The author's own publications, read from the shared read-model that Standard
 * Reader maintains (`publications` where `did` = the signed-in author). Returns
 * an empty list for guests.
 */
const listMyPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<WriterPublication>> => {
    const session = await getWriterSession(getRequest());
    if (!session?.did) return [];

    const { db } = await import("#/db/index.server");
    const schema = await import("#/db/schema");
    const { asc, eq } = await import("drizzle-orm");

    const rows = await db.query.publications.findMany({
      where: eq(schema.publications.did, session.did),
      orderBy: asc(schema.publications.name),
    });

    return rows.map((p) => ({
      uri: p.uri,
      name: p.name,
      url: p.url,
      description: p.description,
      icon: (p.name.trim()[0] ?? "P").toUpperCase(),
      discoverable: p.showInDiscover,
      theme: {
        background: p.themeBackground ?? THEME_FALLBACK.background,
        foreground: p.themeForeground ?? THEME_FALLBACK.foreground,
        accent: p.themeAccent ?? THEME_FALLBACK.accent,
        accentForeground:
          p.themeAccentForeground ?? THEME_FALLBACK.accentForeground,
      },
    }));
  },
);

const documentsInput = z.object({ publicationUri: z.string().min(1) });

/** Published documents in one of the author's publications, newest first. */
const listPublicationDocuments = createServerFn({ method: "GET" })
  .validator(documentsInput)
  .handler(async ({ data }): Promise<Array<WriterDocument>> => {
    const session = await getWriterSession(getRequest());
    if (!session?.did) return [];

    const { db } = await import("#/db/index.server");
    const schema = await import("#/db/schema");
    const { and, desc, eq } = await import("drizzle-orm");

    const rows = await db.query.documents.findMany({
      where: and(
        eq(schema.documents.publicationUri, data.publicationUri),
        eq(schema.documents.did, session.did),
      ),
      orderBy: desc(schema.documents.publishedAt),
    });

    return rows.map((d) => ({
      uri: d.uri,
      title: d.title,
      path: d.path,
      publishedAt: d.publishedAt.toISOString(),
      description: d.description,
      textContent: d.textContent,
      tags: d.tags,
      siteUri: d.siteUri,
    }));
  });

const deleteInput = z.object({ publicationUri: z.string().min(1) });

/**
 * Parse an `at://did/collection/rkey` uri into its record coordinates. Returns
 * `null` for anything that isn't a well-formed AT-URI with all three parts.
 */
function parseAtUri(
  uri: string,
): { repo: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!m) return null;
  return { repo: m[1], collection: m[2], rkey: m[3] };
}

/**
 * Delete one of the author's publications: remove the
 * `site.standard.publication` record from their repo (via
 * `com.atproto.repo.deleteRecord` on the restored OAuth session) and drop the
 * matching read-model row so the sidebar updates immediately. Ownership is
 * enforced by matching the record's repo DID against the session DID.
 */
const deletePublication = createServerFn({ method: "POST" })
  .validator(deleteInput)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const session = await getWriterSession(getRequest());
    if (!session?.did) throw new Error("Unauthorized");

    const coords = parseAtUri(data.publicationUri);
    if (!coords) throw new Error("Invalid publication uri");
    if (coords.repo !== session.did) {
      throw new Error("You can only delete your own publications.");
    }

    const { atprotoOAuth } = await import("#/integrations/auth/atproto");
    const { Client } = await import("@atcute/client");

    const oauthSession = await atprotoOAuth.restore(session.did as never);
    if (!oauthSession) {
      throw new Error("Your session expired — sign in again to continue.");
    }
    const client = new Client({ handler: oauthSession });

    const res = await client.post("com.atproto.repo.deleteRecord", {
      input: {
        repo: session.did as ActorIdentifier,
        collection: coords.collection as `${string}.${string}.${string}`,
        rkey: coords.rkey,
      },
    });
    if (!res.ok) {
      throw new Error("Delete failed — the PDS rejected the write.");
    }

    // Drop the read-model row so the UI reflects the deletion right away; the
    // ingester would otherwise reconcile it on the next sync.
    const { db } = await import("#/db/index.server");
    const schema = await import("#/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await db
      .delete(schema.publications)
      .where(
        and(
          eq(schema.publications.uri, data.publicationUri),
          eq(schema.publications.did, session.did),
        ),
      );

    return { ok: true };
  });

export const publicationsApi = {
  listMyPublications,
  listPublicationDocuments,
  deletePublication,
};

export const myPublicationsQueryOptions = queryOptions({
  queryKey: ["my-publications"],
  queryFn: () => listMyPublications(),
});

export const publicationDocumentsQueryOptions = (publicationUri: string) =>
  queryOptions({
    queryKey: ["publication-documents", publicationUri],
    queryFn: () => listPublicationDocuments({ data: { publicationUri } }),
  });
