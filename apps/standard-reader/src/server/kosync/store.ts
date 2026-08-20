/**
 * Reading and writing KOReader positions, and keeping the app's own
 * `reading_progress` in step with them.
 */

import { and, eq, sql } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

export interface KosyncPosition {
  document: string;
  progress: string;
  percentage: number;
  device: string | null;
  device_id: string | null;
  timestamp: number;
}

/** Resolve a username (handle or DID) to a DID. */
export async function didForKosyncUsername(
  db: Db,
  schema: Schema,
  username: string,
): Promise<string | null> {
  const trimmed = username.trim();
  if (trimmed.startsWith("did:")) return trimmed;

  const handle = trimmed.replace(/^@/, "").toLowerCase();
  const [row] = await db
    .select({ did: schema.profiles.did })
    .from(schema.profiles)
    .where(eq(schema.profiles.handle, handle))
    .limit(1);
  return row?.did ?? null;
}

/** Record the digests a freshly generated book will have on a device. */
export async function rememberBookHashes(
  db: Db,
  schema: Schema,
  documentUri: string,
  hashes: Array<{ hash: string; method: "binary" | "filename" }>,
): Promise<void> {
  if (hashes.length === 0) return;
  await db
    .insert(schema.kosyncDocuments)
    .values(
      hashes.map((entry) => ({
        documentUri,
        hash: entry.hash,
        method: entry.method,
      })),
    )
    // The same book generated twice hashes the same, so a conflict is the
    // normal case, not an error. A hash that somehow moved to another document
    // takes the newer mapping.
    .onConflictDoUpdate({
      set: { documentUri },
      target: schema.kosyncDocuments.hash,
    });
}

/** The document a KOReader digest refers to, if we ever generated that file. */
export async function documentUriForHash(
  db: Db,
  schema: Schema,
  hash: string,
): Promise<string | null> {
  const [row] = await db
    .select({ documentUri: schema.kosyncDocuments.documentUri })
    .from(schema.kosyncDocuments)
    .where(eq(schema.kosyncDocuments.hash, hash))
    .limit(1);
  return row?.documentUri ?? null;
}

export async function readPosition(
  db: Db,
  schema: Schema,
  ownerDid: string,
  documentHash: string,
): Promise<KosyncPosition | null> {
  const [row] = await db
    .select()
    .from(schema.kosyncProgress)
    .where(
      and(
        eq(schema.kosyncProgress.ownerDid, ownerDid),
        eq(schema.kosyncProgress.documentHash, documentHash),
      ),
    )
    .limit(1);
  if (!row) return null;

  return {
    device: row.device,
    device_id: row.deviceId,
    document: row.documentHash,
    percentage: row.percentage,
    progress: row.progress,
    timestamp: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

/**
 * Store a device's position, and mirror the part the app understands.
 *
 * `progress` is opaque (a CRE xpointer, or a page number) and only KOReader can
 * act on it, so it is stored verbatim for other devices to pick up. The
 * percentage is the crossover: written into `reading_progress`, it is what makes
 * an article read half-way on a Kobo show up half-read in the app.
 */
export async function writePosition(
  db: Db,
  schema: Schema,
  ownerDid: string,
  position: {
    document: string;
    progress: string;
    percentage: number;
    device?: string | null;
    deviceId?: string | null;
  },
): Promise<void> {
  const percentage = Math.min(Math.max(position.percentage, 0), 1);

  await db
    .insert(schema.kosyncProgress)
    .values({
      device: position.device ?? null,
      deviceId: position.deviceId ?? null,
      documentHash: position.document,
      ownerDid,
      percentage,
      progress: position.progress,
    })
    .onConflictDoUpdate({
      set: {
        device: position.device ?? null,
        deviceId: position.deviceId ?? null,
        percentage,
        progress: position.progress,
        updatedAt: sql`now()`,
      },
      target: [
        schema.kosyncProgress.ownerDid,
        schema.kosyncProgress.documentHash,
      ],
    });

  const documentUri = await documentUriForHash(db, schema, position.document);
  if (!documentUri) return;

  await db
    .insert(schema.readingProgress)
    .values({ documentUri, ownerDid, progress: percentage })
    .onConflictDoUpdate({
      set: { progress: percentage, updatedAt: sql`now()` },
      target: [
        schema.readingProgress.ownerDid,
        schema.readingProgress.documentUri,
      ],
    });
}
