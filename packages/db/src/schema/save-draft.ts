import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

/**
 * Short-lived pending "save to Margin/Semble" drafts, stashed server-side
 * before the OAuth scope-upgrade round-trip and consumed by
 * `SaveDraftConsumer` (mounted on the article page the reader was already on
 * — the upgrade flow redirects back there, not to a dedicated return route)
 * to auto-create the save (mirrors `feedback-draft.ts` / `upvote-draft.ts`).
 * Rows expire after `SAVE_DRAFT_TTL_MS` and are deleted on read
 * (`consumeSaveDraft`), so the table stays small.
 *
 * Auth-scoped: every read checks `userId` so a leaked draft id can't be used
 * to read or duplicate another reader's draft. `collectionCid` is a
 * best-effort fallback only — the consume path re-resolves the collection's
 * live cid (it may have changed during the OAuth round-trip) rather than
 * trusting the stashed value.
 */

export const SAVE_DRAFT_TTL_MS = 15 * 60_000;

export const saveDraft = pgTable(
  "save_draft",
  {
    /** Opaque random UUID; carried through OAuth `state.redirect` as `?save=`. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `"margin" | "semble"`. */
    targetApp: text("target_app").notNull(),
    /** AT-URI of an existing collection to save into. Mutually exclusive with
     * `newCollectionName` — exactly one is set. */
    collectionUri: text("collection_uri"),
    /** Best-effort cid captured at draft time; re-resolved at consume. */
    collectionCid: text("collection_cid"),
    /** Name for a collection to create at consume time, when the reader chose
     * "+ New collection…" instead of an existing one. */
    newCollectionName: text("new_collection_name"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    /** Semble: the card's `metadata.description`. Margin: the note's
     * `body.value` (a free-text note attached to the bookmark/highlight). */
    description: text("description"),
    author: text("author"),
    siteName: text("site_name"),
    imageUrl: text("image_url"),
    /** Margin only: `"bookmarking" | "highlighting"`. */
    motivation: text("motivation"),
    /** Margin only: the highlighted passage for a `motivation:"highlighting"` note. */
    passage: text("passage"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("save_draft_user_idx").on(table.userId),
    index("save_draft_expires_idx").on(table.expiresAt),
  ],
);

export type SaveDraft = typeof saveDraft.$inferSelect;
export type NewSaveDraft = typeof saveDraft.$inferInsert;
