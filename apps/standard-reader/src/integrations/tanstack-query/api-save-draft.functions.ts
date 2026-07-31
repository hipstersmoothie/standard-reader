import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { SAVE_DRAFT_TTL_MS, saveDraft } from "#/db/schema/save-draft";
import type { SaveDraft } from "#/db/schema/save-draft";
import { getReaderContextForRequest } from "#/middleware/auth-session.server";

/**
 * Shared "save to Margin/Semble collection" draft, stashed server-side before
 * the OAuth scope-upgrade round-trip and consumed once by `SaveDraftConsumer`
 * (mounted on the article page) to perform the actual save — the upgrade
 * flow's redirect target is the article page itself (with `?save=<id>`
 * appended), not a dedicated return route. One table covers both target apps
 * (`targetApp` discriminates); mirrors `feedback-draft.ts` / `upvote-draft.ts`.
 */

const saveDraftInput = z
  .object({
    targetApp: z.enum(["margin", "semble"]),
    collectionUri: z.string().startsWith("at://").optional(),
    collectionCid: z.string().optional(),
    newCollectionName: z.string().min(1).max(200).optional(),
    url: z.string().url(),
    title: z.string().min(1).max(1000),
    description: z.string().max(2000).optional(),
    author: z.string().max(300).optional(),
    siteName: z.string().max(200).optional(),
    imageUrl: z.string().url().optional(),
    motivation: z.enum(["bookmarking", "highlighting"]).optional(),
    passage: z.string().max(10_000).optional(),
  })
  .refine((d) => Boolean(d.collectionUri) !== Boolean(d.newCollectionName), {
    message: "Choose an existing collection or name a new one, not both.",
  });

/**
 * Persist a pending save draft. Returns the row's id (threaded through OAuth
 * `state.redirect` as `?save=<id>`). Auth-scoped to `userId` so a leaked id
 * can't be used by another reader.
 */
const createSaveDraft = createServerFn({ method: "POST" })
  .validator(saveDraftInput)
  .handler(async ({ data }) => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      throw new Error("Unauthorized");
    }
    const { db } = await import("#/db/index.server");
    const id = crypto.randomUUID();
    await db.insert(saveDraft).values({
      id,
      userId: reader.userId,
      targetApp: data.targetApp,
      ...(data.collectionUri ? { collectionUri: data.collectionUri } : {}),
      ...(data.collectionCid ? { collectionCid: data.collectionCid } : {}),
      ...(data.newCollectionName
        ? { newCollectionName: data.newCollectionName }
        : {}),
      url: data.url,
      title: data.title,
      ...(data.description ? { description: data.description } : {}),
      ...(data.author ? { author: data.author } : {}),
      ...(data.siteName ? { siteName: data.siteName } : {}),
      ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
      ...(data.motivation ? { motivation: data.motivation } : {}),
      ...(data.passage ? { passage: data.passage } : {}),
      expiresAt: new Date(Date.now() + SAVE_DRAFT_TTL_MS),
    });
    return { id };
  });

const consumeSaveDraftInput = z.object({
  draftId: z.string().min(1),
});

/**
 * Atomic delete-and-return. Returns the draft row iff it exists, belongs to
 * the signed-in reader, and hasn't expired; returns `null` otherwise.
 * Single-use by design: a refresh on the return route won't re-create the
 * save.
 */
const consumeSaveDraft = createServerFn({ method: "GET" })
  .validator(consumeSaveDraftInput)
  .handler(async ({ data }): Promise<SaveDraft | null> => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) return null;

    const { db } = await import("#/db/index.server");
    const [deleted] = await db
      .delete(saveDraft)
      .where(eq(saveDraft.id, data.draftId))
      .returning();
    if (!deleted) return null;
    if (deleted.userId !== reader.userId) return null;
    if (deleted.expiresAt.getTime() <= Date.now()) return null;
    return deleted;
  });

export const saveDraftApi = {
  createSaveDraft,
  consumeSaveDraft,
};
