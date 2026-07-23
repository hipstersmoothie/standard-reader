/**
 * Server-only: a publication's email list. Double opt-in — `subscribe` creates a
 * `pending` row + capability token and the caller sends a confirmation email;
 * `confirmSubscription` flips it to `confirmed`; `unsubscribeByToken` flips it to
 * `unsubscribed`. `loadConfirmedSubscribers` is the send runner's recipient
 * source. No-ops / empties when no DB is configured.
 */

import { newsletterSubscribers } from "@standard-reader/db/schema";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db/index.server";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SubscribeResult {
  ok: boolean;
  status?: "pending" | "already-confirmed";
  token?: string;
  error?: "no-db" | "invalid-email";
}

export async function subscribe(input: {
  publicationUri: string;
  email: string;
  subscriberDid?: string;
}): Promise<SubscribeResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "no-db" };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid-email" };

  const existing = await db.query.newsletterSubscribers.findFirst({
    where: and(
      eq(newsletterSubscribers.publicationUri, input.publicationUri),
      eq(newsletterSubscribers.email, email),
    ),
  });

  if (existing) {
    if (existing.status === "confirmed") {
      return { ok: true, status: "already-confirmed", token: existing.token };
    }
    // Re-subscribing after unsubscribe (or a still-pending row): rotate the
    // token and go back to pending so a fresh confirmation link is sent.
    const token = crypto.randomUUID();
    await db
      .update(newsletterSubscribers)
      .set({ status: "pending", token, unsubscribedAt: null })
      .where(eq(newsletterSubscribers.id, existing.id));
    return { ok: true, status: "pending", token };
  }

  const token = crypto.randomUUID();
  await db.insert(newsletterSubscribers).values({
    id: crypto.randomUUID(),
    publicationUri: input.publicationUri,
    email,
    subscriberDid: input.subscriberDid,
    status: "pending",
    token,
  });
  return { ok: true, status: "pending", token };
}

export async function confirmSubscription(token: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .update(newsletterSubscribers)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(
      and(
        eq(newsletterSubscribers.token, token),
        eq(newsletterSubscribers.status, "pending"),
      ),
    )
    .returning({ id: newsletterSubscribers.id });
  return Boolean(row);
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .update(newsletterSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.token, token))
    .returning({ id: newsletterSubscribers.id });
  return Boolean(row);
}

export interface LoadedSubscriber {
  email: string;
  unsubscribeToken: string;
}

export async function loadConfirmedSubscribers(
  publicationUri: string,
): Promise<Array<LoadedSubscriber>> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      token: newsletterSubscribers.token,
    })
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.publicationUri, publicationUri),
        eq(newsletterSubscribers.status, "confirmed"),
      ),
    );
  return rows.map((r) => ({ email: r.email, unsubscribeToken: r.token }));
}
