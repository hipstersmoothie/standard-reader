import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

/**
 * A JSON-serializable value, matching the reader's `JsonValue`. Restated here
 * because the schema package sits *below* both apps and cannot reach up into
 * one of them — and because the exact shape matters: a looser
 * `Record<string, unknown>` would not unify with the reader's blob-ref type
 * where a draft crosses a server-fn boundary.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue };

/**
 * An image attachment as stored on a draft: an already-uploaded blob ref plus
 * optional alt text — the bytes never round-trip, only the ref does. The same
 * shape as the reader's `FeedbackImageAttachment` (`#/lib/userinput/space`),
 * which remains the type the feedback code itself speaks.
 */
type FeedbackImageAttachment = {
  blob: { [key: string]: JsonValue };
  alt?: string;
};

/**
 * Short-lived pending feedback drafts, stashed server-side before the OAuth
 * scope-upgrade round-trip and consumed by `/feedback/return` to auto-create
 * the `app.userinput.discussion` record. Rows expire after
 * `FEEDBACK_DRAFT_TTL_MS` and are deleted on read (`consumeFeedbackDraft`), so
 * the table stays small — a per-user GC pass is not strictly required.
 * Auth-scoped: every read checks `userId` so a leaked draft id can't be used
 * to read or duplicate another reader's draft.
 */

export const FEEDBACK_DRAFT_TTL_MS = 15 * 60_000;

export const feedbackDraft = pgTable(
  "feedback_draft",
  {
    /** Opaque random UUID; carried through OAuth `state.redirect` as `?draft=`. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    /** `"bug" | "feature" | "question"` — the space's declared tag values. */
    tag: text("tag").notNull(),
    /**
     * Image attachments as **blob refs**, not bytes. The reader's existing
     * session already carries the `blob` scope (it's in `basicScope`), so the
     * dialog uploads the images to their PDS *before* the OAuth round trip and
     * only the refs wait here. The PDS holds an unreferenced blob well past the
     * 15-minute draft TTL, so the record created on `/feedback/return` can
     * still claim them.
     */
    images: jsonb("images").$type<Array<FeedbackImageAttachment>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("feedback_draft_user_idx").on(table.userId),
    index("feedback_draft_expires_idx").on(table.expiresAt),
  ],
);

export type FeedbackDraft = typeof feedbackDraft.$inferSelect;
export type NewFeedbackDraft = typeof feedbackDraft.$inferInsert;
