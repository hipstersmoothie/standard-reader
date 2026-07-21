/**
 * Standard Reader's feedback space on userinput.app.
 *
 * The space lives at a fixed AT-URI (the user gave us this URL), but its `cid`
 * can change if the space metadata is edited (icon/name/tags), so we resolve
 * the strongRef on demand and cache it briefly. The space record lives in our
 * org DID's repo; if that record doesn't exist yet, the create flow surfaces a
 * clear error rather than failing at the PDS.
 *
 * See the userinput lexicons at:
 *   https://pdsls.dev/at://did:plc:uyixj57k6nmxrdj7pjs2ss5s/com.atproto.lexicon.schema
 */

/** The space's stable AT-URI. The record key never changes. */
export const STANDARD_READER_SPACE_URI =
  "at://did:plc:f4os2wz5fjl56xpwcvtnqu7m/app.userinput.space/3mprrc56lgd2e";

/** The space record's repo (used to look up the latest CID). */
const SPACE_REPO_DID = "did:plc:f4os2wz5fjl56xpwcvtnqu7m";
const SPACE_COLLECTION = "app.userinput.space";
const SPACE_RKEY = "3mprrc56lgd2e";

/**
 * Tags the space declares, in display order. Used to drive the dialog's
 * category chooser and to validate submissions. The values are the machine
 * forms stored on discussions; the labels are the human forms.
 */
export const STANDARD_READER_FEEDBACK_TAGS = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature request" },
  { value: "question", label: "Question" },
] as const;

export type FeedbackTag =
  (typeof STANDARD_READER_FEEDBACK_TAGS)[number]["value"];

/**
 * The constellation AppView that indexes userinput discussions. The
 * `app.userinput.discussion` lexicon says discussions are "indexed by
 * constellation at space.uri" — constellation is `constellation.microcosm.blue`,
 * a generic backlinks indexer (NOT a custom userinput XRPC). Discussions are
 * queried via `blue.microcosm.links.getBacklinks` against our space's AT-URI:
 * each discussion record's `space` field is a strongRef to the space, so the
 * indexer returns them as backlinks with `source = "app.userinput.discussion:space"`.
 *
 * The backlink records carry `{ uri, cid, value }` where `value` is the full
 * discussion record; the author DID is parsed from the backlink `uri`
 * (`at://<did>/app.userinput.discussion/<rkey>`).
 */
export const USERINPUT_APPVIEW_BASE = "https://constellation.microcosm.blue";

/**
 * The XRPC method used to list discussions for a space. Constellation is a
 * generic backlinks indexer, so this is a backlinks query — not a
 * userinput-specific method.
 */
export const USERINPUT_LIST_DISCUSSIONS_METHOD =
  "blue.microcosm.links.getBacklinks";

/**
 * Backlink source descriptor for discussions pointing at a space. The
 * constellation `source` param is `${collection}:${propertyPath}` —
 * discussions point at the space via their `space.uri` field, so the path is
 * `space.uri` (the full dotted path to the URI within the strongRef object).
 */
export const USERINPUT_DISCUSSION_SOURCE = "app.userinput.discussion:space.uri";

/**
 * Backlink source descriptor for upvotes pointing at a discussion. Upvotes
 * point at their subject via `subject.uri` (per the `app.userinput.upvote`
 * lexicon), so the path is `subject.uri`. Used with
 * `blue.microcosm.links.getBacklinksCount` to fetch per-discussion vote totals.
 */
export const USERINPUT_UPVOTE_SOURCE = "app.userinput.upvote:subject.uri";

/** PDS endpoint for resolving records in our space's repo. */
const SPACE_PDS = "https://stropharia.us-west.host.bsky.network";

/**
 * States a discussion can be assigned via userinput.app's moderator UI. Set
 * as `app.userinput.status` records in our own org repo (the space owner) —
 * see {@link fetchStandardReaderDiscussionStatuses}.
 */
export type FeedbackStatus =
  | "open"
  | "under-review"
  | "backlog"
  | "planned"
  | "in-progress"
  | "implemented"
  | "declined"
  | "duplicate"
  | "closed";

const STATUS_COLLECTION = "app.userinput.status";

interface StatusRecordValue {
  state?: FeedbackStatus;
  subject?: { uri?: string };
  createdAt?: string;
}

/**
 * Fetch the latest status assigned to each discussion in our feedback space,
 * keyed by discussion AT-URI. Status records are authored directly in our own
 * org repo via userinput.app's moderator UI (`app.userinput.status`; "latest
 * `createdAt` wins" per the lexicon, since a discussion can move through
 * several states over time) — read straight from our own PDS rather than
 * through constellation, since it's our own repo and there's no indexing lag
 * to wait out.
 */
export async function fetchStandardReaderDiscussionStatuses(): Promise<
  Map<string, FeedbackStatus>
> {
  const latest = new Map<
    string,
    { state: FeedbackStatus; createdAt: string }
  >();
  try {
    let cursor: string | undefined;
    do {
      const url = new URL(`${SPACE_PDS}/xrpc/com.atproto.repo.listRecords`);
      url.searchParams.set("repo", SPACE_REPO_DID);
      url.searchParams.set("collection", STATUS_COLLECTION);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) break;
      const json = (await res.json()) as {
        records?: Array<{ value: StatusRecordValue }>;
        cursor?: string;
      };
      for (const record of json.records ?? []) {
        const { subject, state, createdAt } = record.value;
        if (!subject?.uri || !state || !createdAt) continue;
        const existing = latest.get(subject.uri);
        if (!existing || createdAt > existing.createdAt) {
          latest.set(subject.uri, { state, createdAt });
        }
      }
      cursor = json.cursor;
    } while (cursor);
  } catch {
    // Best-effort — a status fetch failure shouldn't block the discussion list.
  }

  const out = new Map<string, FeedbackStatus>();
  for (const [uri, { state }] of latest) out.set(uri, state);
  return out;
}

interface StrongRef {
  uri: string;
  cid: string;
}

const CID_CACHE_TTL_MS = 5 * 60_000;
let cidCache: { cid: string; expiresAt: number } | null = null;

/**
 * Resolve the current strongRef (uri + cid) for our feedback space. The cid is
 * cached for {@link CID_CACHE_TTL_MS} so we don't round-trip to the PDS on
 * every feedback submission; if the space is edited, the next submission
 * after TTL picks up the new cid.
 *
 * Throws on a missing record so the create server fn surfaces a clear error
 * (the space must exist on the PDS before users can post).
 */
export async function resolveStandardReaderSpaceStrongRef(): Promise<StrongRef> {
  if (cidCache && cidCache.expiresAt > Date.now()) {
    return { uri: STANDARD_READER_SPACE_URI, cid: cidCache.cid };
  }

  const url = new URL(`${SPACE_PDS}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", SPACE_REPO_DID);
  url.searchParams.set("collection", SPACE_COLLECTION);
  url.searchParams.set("rkey", SPACE_RKEY);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    cidCache = null;
    throw new Error(
      `Could not resolve Standard Reader feedback space (${res.status}). The space record must exist before feedback can be submitted.`,
    );
  }
  const json = (await res.json()) as { cid?: string };
  if (!json.cid) {
    cidCache = null;
    throw new Error("Standard Reader feedback space record is missing a cid.");
  }

  cidCache = { cid: json.cid, expiresAt: Date.now() + CID_CACHE_TTL_MS };
  return { uri: STANDARD_READER_SPACE_URI, cid: json.cid };
}
