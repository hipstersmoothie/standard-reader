import { user } from "@standard-reader/db/schema";
/**
 * Standard Writer Pro — one question, asked in one place.
 *
 * There is no payment provider wired up yet: `user.pro_since` is set by hand,
 * and when billing does land it will only change what *writes* that column.
 * Everything that gates on Pro goes through `isPro` / `requirePro` here, so
 * `grep requirePro` is an exhaustive list of what Pro actually buys — which is
 * the property that matters when someone asks what they are paying for.
 *
 * Today that list is: custom domains for a site, and custom domains for a
 * newsletter's links.
 */
import { eq } from "drizzle-orm";

import { getDb } from "../db/index.server";

/** Raised by {@link requirePro} — the caller turns it into a 402-ish message. */
export class ProRequiredError extends Error {
  constructor(feature: string) {
    super(`${feature} is a Standard Writer Pro feature.`);
    this.name = "ProRequiredError";
  }
}

/** Whether this account currently has Pro. */
export async function isPro(did: string | undefined): Promise<boolean> {
  if (!did) return false;
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ proSince: user.proSince })
    .from(user)
    .where(eq(user.did, did))
    .limit(1);
  return row?.proSince != null;
}

/**
 * Assert Pro before doing something only Pro can do.
 *
 * Server-side and unconditional: the UI also hides these controls, but hiding
 * a control is a courtesy, not a check — the request is what has to be refused.
 */
export async function requirePro(
  did: string | undefined,
  feature: string,
): Promise<void> {
  if (!(await isPro(did))) throw new ProRequiredError(feature);
}
