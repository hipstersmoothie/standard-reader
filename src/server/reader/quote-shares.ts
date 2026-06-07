import { db } from "#/db/index.server";
import { quoteShares } from "#/db/schema/quote-shares";
import { MAX_QUOTE_SHARE_LENGTH, normalizeQuoteText } from "#/lib/quote-share";
import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

const QUOTE_SHARE_ID_LENGTH = 10;

function quoteShareId(documentUri: string, quoteText: string): string {
  return createHash("sha256")
    .update(`${documentUri}\0${normalizeQuoteText(quoteText)}`)
    .digest("base64url")
    .slice(0, QUOTE_SHARE_ID_LENGTH);
}

export async function upsertQuoteShare(
  documentUri: string,
  quoteText: string,
): Promise<{ id: string; quoteText: string }> {
  const normalized = normalizeQuoteText(quoteText);
  if (!normalized) {
    throw new Error("Quote text is empty");
  }
  if (normalized.length > MAX_QUOTE_SHARE_LENGTH) {
    throw new Error("Quote text is too long");
  }

  const id = quoteShareId(documentUri, normalized);
  const now = new Date();

  await db
    .insert(quoteShares)
    .values({
      id,
      documentUri,
      quoteText: normalized,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: quoteShares.id,
      set: {
        documentUri,
        quoteText: normalized,
        updatedAt: now,
      },
    });

  return { id, quoteText: normalized };
}

export async function getQuoteShareForDocument(
  id: string,
  documentUri: string,
): Promise<string | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const rows = await db
    .select({ quoteText: quoteShares.quoteText })
    .from(quoteShares)
    .where(
      and(
        eq(quoteShares.id, trimmed),
        eq(quoteShares.documentUri, documentUri),
      ),
    )
    .limit(1);

  return rows[0]?.quoteText ?? null;
}

const MAX_QUOTE_SHARES_FOR_COMMENTS = 50;

export async function listQuoteSharesForDocument(
  documentUri: string,
): Promise<Array<{ id: string; quoteText: string }>> {
  return db
    .select({ id: quoteShares.id, quoteText: quoteShares.quoteText })
    .from(quoteShares)
    .where(eq(quoteShares.documentUri, documentUri))
    .orderBy(desc(quoteShares.createdAt))
    .limit(MAX_QUOTE_SHARES_FOR_COMMENTS);
}
