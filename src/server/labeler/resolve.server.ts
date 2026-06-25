/**
 * Labeler discovery, record-driven.
 *
 * A labeler is registered by an `app.standard-reader.labeler.service` record
 * (owned by its author's account). Tap indexes those into `labeler_services`, so
 * discovery is just a read-model lookup — no DID-document / getServices fetches.
 * The record carries where to reach the label server (`serviceEndpoint`), so the
 * label server itself only answers queryLabels / subscribeLabels.
 */

import { db } from "#/db/index.server";
import { labelerServices } from "#/db/schema";
import { and, eq } from "drizzle-orm";

export interface LabelValueDef {
  identifier?: string;
  severity?: string;
  blurs?: string;
  defaultSetting?: string;
  adultOnly?: boolean;
  locales?: Array<{ lang?: string; name?: string; description?: string }>;
}

export interface ResolvedLabelerView {
  did: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  labelValueDefinitions?: Array<LabelValueDef>;
}

async function serviceRow(did: string) {
  const [row] = await db
    .select()
    .from(labelerServices)
    .where(
      and(
        eq(labelerServices.labelerDid, did),
        eq(labelerServices.deleted, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** All registered labeler DIDs (the directory). */
export async function knownLabelerDids(): Promise<Array<string>> {
  const rows = await db
    .selectDistinct({ labelerDid: labelerServices.labelerDid })
    .from(labelerServices)
    .where(eq(labelerServices.deleted, false));
  return rows.map((r) => r.labelerDid);
}

/** Where to reach a labeler's label server (from its registration record). */
export async function resolveLabelerEndpoint(
  did: string,
): Promise<string | null> {
  const row = await serviceRow(did);
  return row?.serviceEndpoint ?? null;
}

/** A labeler's presentation, from its registration record. */
export async function resolveLabelerView(
  did: string,
): Promise<ResolvedLabelerView | null> {
  const row = await serviceRow(did);
  if (!row) return null;
  return {
    did,
    displayName: row.displayName ?? undefined,
    description: row.description ?? undefined,
    avatar: row.avatarUrl ?? undefined,
    labelValueDefinitions:
      (row.labelValueDefinitions as Array<LabelValueDef> | null) ?? undefined,
  };
}

/** Resolve a handle or DID to a DID (handles via the well-known lookup). */
export async function resolveActorDid(actor: string): Promise<string | null> {
  if (actor.startsWith("did:")) return actor;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`https://${actor}/.well-known/atproto-did`, {
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const text = await r.text();
    const did = text.trim();
    return did.startsWith("did:") ? did : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
