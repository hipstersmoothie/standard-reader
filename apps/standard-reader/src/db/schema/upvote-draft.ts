import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

/**
 * Short-lived pending upvote drafts, stashed server-side before the OAuth
 * scope-upgrade round-trip and consumed by `/feedback/return` to auto-create
 * the `app.userinput.upvote` record. Rows expire after `UPVOTE_DRAFT_TTL_MS`
 * and are deleted on read (`consumeUpvoteDraft`), so the table stays small.
 *
 * Auth-scoped: every read checks `userId` so a leaked draft id can't be used to
 * upvote on another reader's behalf. The `subjectUri` is the discussion AT-URI;
 * the cid is re-resolved at consume time (it may have changed during the OAuth
 * round-trip, so we don't stash it).
 */

export const UPVOTE_DRAFT_TTL_MS = 15 * 60_000;

export const upvoteDraft = pgTable(
  "upvote_draft",
  {
    /** Opaque random UUID; carried through OAuth `state.redirect` as `?upvote=`. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The discussion AT-URI being upvoted. */
    subjectUri: text("subject_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("upvote_draft_user_idx").on(table.userId),
    index("upvote_draft_expires_idx").on(table.expiresAt),
  ],
);

export type UpvoteDraft = typeof upvoteDraft.$inferSelect;
export type NewUpvoteDraft = typeof upvoteDraft.$inferInsert;
