import {
  index,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * KOReader progress sync (kosync).
 *
 * KOReader identifies a book by a hash of the *file*, not by any identifier we
 * gave it — there is nowhere in the protocol to put an AT-URI. So a device
 * reports progress for `a1b2c3…` and the server has to know what that was.
 *
 * That is what this table is: every time we generate a book, we record the
 * hashes that file will have on a device. Generation is deterministic (see
 * `server/books/zip.ts`), so the hash can be computed at download time and
 * still match what the device computes later, on a copy of the file we no
 * longer have.
 *
 * A document has more than one row because KOReader offers two matching
 * methods — the partial MD5 of the file's contents (its default) and the MD5 of
 * the filename — and the reader can switch between them per device.
 */
export const kosyncDocuments = pgTable(
  "kosync_documents",
  {
    /** The digest KOReader sends as `document` — lowercase hex MD5. */
    hash: text("hash").primaryKey(),
    /** AT-URI of the `site.standard.document` the file was built from. */
    documentUri: text("document_uri").notNull(),
    /** `binary` (partial MD5 of contents) or `filename` (MD5 of basename). */
    method: text("method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("kosync_documents_uri_idx").on(table.documentUri)],
);

/**
 * A device's reading position, exactly as KOReader sent it.
 *
 * Stored verbatim rather than normalised because `progress` is opaque: for a
 * reflowable book it is a CRE xpointer into that device's rendering, for a
 * paged one a page number. Only KOReader can interpret it, so only KOReader's
 * own bytes go back out — the app never fabricates one.
 *
 * `percentage` is the part both worlds understand, and it is mirrored into
 * `reading_progress` when the hash resolves to a document we know: finish a
 * chapter on the Kobo and the article shows as part-read in the app.
 */
export const kosyncProgress = pgTable(
  "kosync_progress",
  {
    /** DID of the reader, resolved from the kosync credentials. */
    ownerDid: text("owner_did").notNull(),
    /** The `document` digest the device reported. */
    documentHash: text("document_hash").notNull(),
    /** Opaque position string — an xpointer or a page number. */
    progress: text("progress").notNull(),
    /** Fraction read, 0–1. The only field that means anything outside KOReader. */
    percentage: real("percentage").notNull(),
    /** Human device name ("Kobo Clara"), shown when positions conflict. */
    device: text("device"),
    /** Stable per-device id, so a device does not sync with itself. */
    deviceId: text("device_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerDid, table.documentHash] }),
    index("kosync_progress_owner_idx").on(
      table.ownerDid,
      table.updatedAt.desc(),
    ),
  ],
);

export type KosyncDocument = typeof kosyncDocuments.$inferSelect;
export type KosyncProgress = typeof kosyncProgress.$inferSelect;
