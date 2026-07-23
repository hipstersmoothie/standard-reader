import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

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
