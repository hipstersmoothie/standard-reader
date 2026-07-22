import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { DraftRow } from "#/db/schema/drafts";
import { getWriterSession } from "#/middleware/auth-session.server";

/**
 * Draft CRUD, scoped to the signed-in writer. Drafts are the writer's own
 * server-side state (see `APP_VISION.md` §6): private, mutable, pre-publication
 * documents keyed to the author's user id on the shared Neon database.
 */

const listDrafts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<DraftRow>> => {
    const session = await getWriterSession(getRequest());
    if (!session) return [];
    const { db } = await import("#/db/index.server");
    const { drafts } = await import("#/db/schema/drafts");
    return db.query.drafts.findMany({
      where: eq(drafts.userId, session.userId),
      orderBy: desc(drafts.updatedAt),
    });
  },
);

const getDraftInput = z.object({ id: z.string().min(1) });

const getDraft = createServerFn({ method: "GET" })
  .validator(getDraftInput)
  .handler(async ({ data }): Promise<DraftRow | null> => {
    const session = await getWriterSession(getRequest());
    if (!session) return null;
    const { db } = await import("#/db/index.server");
    const { drafts } = await import("#/db/schema/drafts");
    const row = await db.query.drafts.findFirst({
      where: and(eq(drafts.id, data.id), eq(drafts.userId, session.userId)),
    });
    return row ?? null;
  });

const upsertDraftInput = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(1000).default(""),
  path: z.string().max(500).optional(),
  bodyMarkdown: z.string().default(""),
  tags: z.array(z.string().max(100)).optional(),
  destinationUri: z.string().startsWith("at://").optional(),
  coverImageUrl: z.string().url().optional(),
});

/** Insert a new draft or update an existing one owned by the writer. */
const upsertDraft = createServerFn({ method: "POST" })
  .validator(upsertDraftInput)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const session = await getWriterSession(getRequest());
    if (!session) throw new Error("Unauthorized");
    const { db } = await import("#/db/index.server");
    const { drafts } = await import("#/db/schema/drafts");

    const values = {
      title: data.title,
      bodyMarkdown: data.bodyMarkdown,
      ...(data.path === undefined ? {} : { path: data.path }),
      ...(data.tags === undefined ? {} : { tags: data.tags }),
      ...(data.destinationUri === undefined
        ? {}
        : { destinationUri: data.destinationUri }),
      ...(data.coverImageUrl === undefined
        ? {}
        : { coverImageUrl: data.coverImageUrl }),
    };

    if (data.id) {
      const updated = await db
        .update(drafts)
        .set(values)
        .where(and(eq(drafts.id, data.id), eq(drafts.userId, session.userId)))
        .returning({ id: drafts.id });
      if (updated.length > 0) return { id: data.id };
    }

    const id = data.id ?? crypto.randomUUID();
    await db.insert(drafts).values({ id, userId: session.userId, ...values });
    return { id };
  });

const deleteDraftInput = z.object({ id: z.string().min(1) });

const deleteDraft = createServerFn({ method: "POST" })
  .validator(deleteDraftInput)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const session = await getWriterSession(getRequest());
    if (!session) throw new Error("Unauthorized");
    const { db } = await import("#/db/index.server");
    const { drafts } = await import("#/db/schema/drafts");
    await db
      .delete(drafts)
      .where(and(eq(drafts.id, data.id), eq(drafts.userId, session.userId)));
    return { ok: true };
  });

export const draftsApi = {
  listDrafts,
  getDraft,
  upsertDraft,
  deleteDraft,
};

export const draftsQueryOptions = queryOptions({
  queryKey: ["drafts"],
  queryFn: () => listDrafts(),
});
