// Registers the com.atproto.* lexicons on the atcute client type + runtime
// registry so `com.atproto.repo.putRecord` is known.
import "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { toMarkpubRecord } from "@standard-reader/design-system/rich-text-editor";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getWriterSession } from "#/middleware/auth-session.server";

const DOCUMENT_COLLECTION = "site.standard.document";

/** A valid rkey (hex, no separators) for the new document record. */
function newRkey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

const publishInput = z.object({
  draftId: z.string().min(1),
  /**
   * The document's public home: a publication `at://` uri, or an `https://` URL
   * for a loose document. Standard Reader renders both.
   */
  site: z.string().min(1),
});

/**
 * Publish a draft to the author's repo as a `site.standard.document` record
 * (via `com.atproto.repo.putRecord` on the restored OAuth session), then clear
 * the draft. The record body is the portable `at.markpub.markdown` the editor
 * produced — exactly what Standard Reader ingests. Record shape follows
 * `APP_VISION.md` §6 and the reader's `putDocumentRecord`.
 */
const publishDraft = createServerFn({ method: "POST" })
  .validator(publishInput)
  .handler(async ({ data }): Promise<{ uri: string }> => {
    const session = await getWriterSession(getRequest());
    if (!session?.did) throw new Error("Unauthorized");

    const { db } = await import("#/db/index.server");
    const { drafts } = await import("#/db/schema/drafts");
    const { and, eq } = await import("drizzle-orm");

    const draft = await db.query.drafts.findFirst({
      where: and(
        eq(drafts.id, data.draftId),
        eq(drafts.userId, session.userId),
      ),
    });
    if (!draft) throw new Error("Draft not found");

    const { atprotoOAuth } = await import("#/integrations/auth/atproto");
    const { Client } = await import("@atcute/client");

    const oauthSession = await atprotoOAuth.restore(session.did as never);
    if (!oauthSession) {
      throw new Error("Your session expired — sign in again to publish.");
    }
    const client = new Client({ handler: oauthSession });

    const record: Record<string, unknown> = {
      $type: DOCUMENT_COLLECTION,
      site: data.site,
      title: draft.title || "Untitled",
      publishedAt: new Date().toISOString(),
      content: toMarkpubRecord(draft.bodyMarkdown),
      ...(draft.path ? { path: draft.path } : {}),
      ...(draft.tags && draft.tags.length > 0 ? { tags: draft.tags } : {}),
    };

    const res = await client.post("com.atproto.repo.putRecord", {
      input: {
        repo: session.did as ActorIdentifier,
        collection: DOCUMENT_COLLECTION,
        rkey: newRkey(),
        record,
      },
    });
    if (!res.ok) {
      throw new Error("Publish failed — the PDS rejected the write.");
    }

    // Published: the repo record is now the source of truth; clear the draft.
    await db.delete(drafts).where(eq(drafts.id, draft.id));

    return { uri: (res.data as { uri: string }).uri };
  });

export const publishApi = { publishDraft };
