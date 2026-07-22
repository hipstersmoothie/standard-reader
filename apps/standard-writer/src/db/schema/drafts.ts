/**
 * Writer-owned draft table.
 *
 * Unlike Standard Reader — where Postgres is a pure read-model cache of records
 * that live in repos — Standard Writer keeps in-progress documents in the DB,
 * keyed to the author's user id (see `APP_VISION.md` §6). Drafts are private,
 * mutable, pre-publication state; the moment a document is published it becomes
 * a `site.standard.document` in the author's repo and the draft is cleared.
 *
 * This is the only table Standard Writer owns; it lives on the same Neon
 * database as Standard Reader (shared `DATABASE_URL`) alongside the reused
 * identity tables (`user` / `session` / `account` / `verification`), but the
 * reader owns those — the writer only ever migrates `writer_drafts`.
 */
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const drafts = pgTable(
  "writer_drafts",
  {
    id: text("id").primaryKey(),
    /** Owning user id (matches `user.id` from the shared auth tables). */
    userId: text("user_id").notNull(),
    title: text("title").notNull().default(""),
    /** Slug the document will publish at (within its destination). */
    path: text("path"),
    /** Body as `at.markpub.markdown` — the wire format the editor serializes. */
    bodyMarkdown: text("body_markdown").notNull().default(""),
    tags: text("tags").array(),
    /** Destination publication `at://` uri, or null for a loose document. */
    destinationUri: text("destination_uri"),
    coverImageUrl: text("cover_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("writer_drafts_user_id_idx").on(table.userId)],
);

export type DraftRow = typeof drafts.$inferSelect;
