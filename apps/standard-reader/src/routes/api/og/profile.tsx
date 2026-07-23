import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import { resolveIdentity } from "#/server/atproto/identity";
import { renderProfileOgImage } from "#/server/og/profile-card";
import { authorProfileStats } from "#/server/reader/queries";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

interface ProfileOgMeta {
  displayName: string;
  handle: string | null;
  description: string | null;
  avatarUrl: string | null;
}

async function loadProfileOgMeta(did: string): Promise<ProfileOgMeta | null> {
  const pr = schema.profiles;
  const [row] = await db
    .select({
      handle: pr.handle,
      displayName: pr.displayName,
      description: pr.description,
      avatarUrl: pr.avatarUrl,
    })
    .from(pr)
    .where(eq(pr.did, did))
    .limit(1);

  if (row) {
    const [identity, publicProfile] = await Promise.all([
      row.handle ? Promise.resolve(null) : resolveIdentity(did),
      !row.displayName || !row.avatarUrl
        ? fetchBlueskyPublicProfileFields(did)
        : Promise.resolve(null),
    ]);

    const handle =
      row.handle ?? identity?.handle ?? publicProfile?.handle ?? null;
    const displayName = row.displayName ?? publicProfile?.displayName ?? null;

    if (!displayName && !handle) return null;

    return {
      displayName: displayName ?? (handle ? `@${handle}` : "Author"),
      handle,
      description: row.description,
      avatarUrl: row.avatarUrl ?? publicProfile?.avatarUrl ?? null,
    };
  }

  // No DB row yet — fall back to identity + public profile (backfill-on-read).
  const [identity, publicProfile] = await Promise.all([
    resolveIdentity(did),
    fetchBlueskyPublicProfileFields(did),
  ]);

  const handle = identity.handle ?? publicProfile?.handle ?? null;
  const displayName = publicProfile?.displayName ?? null;

  if (!displayName && !handle) return null;

  return {
    displayName: displayName ?? (handle ? `@${handle}` : "Author"),
    handle,
    description: null,
    avatarUrl: publicProfile?.avatarUrl ?? null,
  };
}

export const Route = createFileRoute("/api/og/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const did = url.searchParams.get("did")?.trim();

        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        try {
          const meta = await loadProfileOgMeta(did);
          if (!meta) {
            return new Response("Not Found", { status: 404 });
          }

          const stats = await authorProfileStats(db, schema, did);

          const png = await renderProfileOgImage({
            displayName: meta.displayName,
            handle: meta.handle,
            description: meta.description,
            avatarUrl: meta.avatarUrl,
            publicationCount: stats.publicationCount,
            documentCount: stats.documentCount,
            subscriberCount: stats.subscriberCount,
          });

          return new Response(Buffer.from(png), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": CACHE_CONTROL,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to render image";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
