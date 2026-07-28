/**
 * Read a reader's labeler setup from their Bluesky preferences.
 *
 * Bluesky does not store subscribed labelers as repo records — they live in the
 * account's preferences blob, as an `app.bsky.actor.defs#labelersPref` entry
 * plus one `#contentLabelPref` per label the reader has an opinion about. So
 * porting someone's moderation setup means reading
 * `app.bsky.actor.getPreferences` on their authenticated session.
 *
 * **Read-only, deliberately.** We never call `putPreferences`: it replaces the
 * whole preferences array, so a read-modify-write against a scope that only
 * exposes part of it would silently drop the parts we couldn't see (mute words,
 * feed prefs, adult-content settings). Unsubscribing inside Standard Reader is
 * therefore local and never edits anyone's Bluesky moderation.
 */

import type { Client } from "@atcute/client";

import type { LabelVisibility } from "#/db/schema/labels";

/** A reader's labeler setup as declared in their Bluesky preferences. */
export interface BskyLabelerPrefs {
  /** DIDs of the labelers they subscribe to on Bluesky. */
  labelerDids: Array<string>;
  /** Their per-label visibility choices, keyed `${labelerDid} ${label}`. */
  visibility: Map<string, LabelVisibility>;
}

interface PrefItem {
  $type?: string;
  /** labelersPref */
  labelers?: Array<{ did?: string }>;
  /** contentLabelPref */
  labelerDid?: string;
  label?: string;
  visibility?: string;
}

const LABELERS_PREF = "app.bsky.actor.defs#labelersPref";
const CONTENT_LABEL_PREF = "app.bsky.actor.defs#contentLabelPref";

/**
 * Map a Bluesky visibility to ours.
 *
 * Bluesky has four values to our three: its `show` and `ignore` both mean "no
 * treatment", which is our `ignore`. Anything unrecognized is dropped rather
 * than guessed, so an unknown future value falls back to our default rather
 * than silently un-hiding something the reader chose to hide.
 */
function mapVisibility(value: string | undefined): LabelVisibility | null {
  switch (value) {
    case "hide": {
      return "hide";
    }
    case "warn": {
      return "warn";
    }
    case "show":
    case "ignore": {
      return "ignore";
    }
    default: {
      return null;
    }
  }
}

/**
 * Fetch the reader's Bluesky labeler subscriptions + per-label prefs.
 *
 * Returns `null` when preferences can't be read at all — no granted scope, an
 * older PDS, a network failure. Callers treat that as "nothing to import"
 * rather than as an error: this runs on the sign-in path and must never be able
 * to break a login.
 */
export async function fetchBskyLabelerPrefs(
  client: Client,
): Promise<BskyLabelerPrefs | null> {
  let items: Array<PrefItem>;
  try {
    // Called through `client.handler` rather than `client.get`: the app.bsky.*
    // lexicons aren't registered in this codebase (we only depend on
    // @atcute/atproto), and the handler is the same OAuth-aware fetch — DPoP
    // proofs and token refresh included — that `get` would have used.
    const res = await client.handler("/xrpc/app.bsky.actor.getPreferences", {
      method: "GET",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: Array<PrefItem> };
    items = data.preferences ?? [];
  } catch {
    return null;
  }

  const labelerDids: Array<string> = [];
  const visibility = new Map<string, LabelVisibility>();

  for (const item of items) {
    if (item.$type === LABELERS_PREF) {
      for (const entry of item.labelers ?? []) {
        if (typeof entry?.did === "string") labelerDids.push(entry.did);
      }
      continue;
    }
    if (item.$type === CONTENT_LABEL_PREF) {
      // A `contentLabelPref` with no `labelerDid` is a global preference
      // covering every labeler that emits the value. Our prefs are stored per
      // labeler, so a global one is applied to each labeler at merge time —
      // here we only keep the ones scoped to a specific labeler.
      const mapped = mapVisibility(item.visibility);
      if (!mapped || typeof item.label !== "string") continue;
      const key = item.labelerDid
        ? `${item.labelerDid} ${item.label}`
        : `* ${item.label}`;
      visibility.set(key, mapped);
    }
  }

  return { labelerDids: [...new Set(labelerDids)], visibility };
}

/**
 * The per-label prefs to store for one labeler, combining that labeler's own
 * `contentLabelPref` entries with any global (labeler-less) ones. Labeler-
 * scoped entries win over global ones for the same label value.
 */
export function prefsForLabeler(
  prefs: BskyLabelerPrefs,
  labelerDid: string,
  labelValues: Array<string>,
): Array<{ val: string; visibility: LabelVisibility }> {
  const out: Array<{ val: string; visibility: LabelVisibility }> = [];
  for (const val of labelValues) {
    const scoped = prefs.visibility.get(`${labelerDid} ${val}`);
    const global = prefs.visibility.get(`* ${val}`);
    const visibility = scoped ?? global;
    if (visibility) out.push({ val, visibility });
  }
  return out;
}
