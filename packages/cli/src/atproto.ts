/**
 * The AT Protocol side of the CLI: log in, read the account's document
 * records, and write converted ones back.
 *
 * Reads go straight to the authenticated PDS rather than to an appview cache —
 * the repo is the source of truth, and a conversion that overwrites a record
 * must be computed from the record as it exists right now.
 */

import type {
  ComAtprotoRepoListRecords,
  ComAtprotoRepoPutRecord,
} from "@atcute/atproto";
import { Client, ok, simpleFetchHandler } from "@atcute/client";
import type { InferInput } from "@atcute/lexicons/validations";
import { PasswordSession } from "@atcute/password-session";

const DOCUMENT_COLLECTION = "site.standard.document";

/**
 * The lexicon types brand plain strings (NSIDs, DIDs, record keys) with their
 * validated forms. Runtime validation is the PDS's job, so these narrow the
 * plain values the CLI holds into the shapes the typed client expects.
 */
type ListRecordsParams = InferInput<
  typeof ComAtprotoRepoListRecords.mainSchema.params
>;
type PutRecordInput = InferInput<
  (typeof ComAtprotoRepoPutRecord.mainSchema.input)["schema"]
>;

export interface Session {
  client: Client;
  /** DID of the repo this session addresses — the `repo` for reads and writes. */
  did: string;
  handle: string;
  service: string;
  /**
   * Whether this session can write. False for the anonymous read-only session
   * used by `list` and `convert --dry-run`, which need no credentials because
   * `com.atproto.repo.listRecords` is a public endpoint.
   */
  canWrite: boolean;
}

export interface Credentials {
  identifier: string;
  password: string;
  service: string;
}

export class CliError extends Error {}

/**
 * Credentials from flags, falling back to the environment.
 *
 * An app password, not an account password: it is the only credential that can
 * be revoked without changing the account's own password, and it is all the
 * repo writes here need.
 */
export function resolveCredentials(input: {
  identifier?: string;
  password?: string;
  service?: string;
}): Credentials {
  const identifier =
    input.identifier ?? process.env.STANDARD_READER_IDENTIFIER ?? "";
  const password =
    input.password ?? process.env.STANDARD_READER_APP_PASSWORD ?? "";
  const service =
    input.service ??
    process.env.STANDARD_READER_PDS_URL ??
    "https://bsky.social";

  if (!identifier) {
    throw new CliError(
      "No account given. Pass --identifier or set STANDARD_READER_IDENTIFIER.",
    );
  }
  if (!password) {
    throw new CliError(
      "No app password given. Pass --password or set STANDARD_READER_APP_PASSWORD.\n" +
        "Create one at https://bsky.app/settings/app-passwords — do not use your account password.",
    );
  }
  return { identifier, password, service };
}

export async function login(credentials: Credentials): Promise<Session> {
  let session: PasswordSession;
  try {
    session = await PasswordSession.login(credentials);
  } catch (error) {
    throw new CliError(
      `Could not sign in as ${credentials.identifier}: ${describeError(error)}`,
    );
  }
  const did = session.did;
  if (!did) throw new CliError("Sign-in succeeded but returned no DID.");
  return {
    canWrite: true,
    client: new Client({ handler: session }),
    did,
    handle: session.session.handle,
    service: credentials.service,
  };
}

/** True when the environment or flags supply enough to sign in. */
export function hasCredentials(input: {
  identifier?: string;
  password?: string;
}): boolean {
  const identifier =
    input.identifier ?? process.env.STANDARD_READER_IDENTIFIER ?? "";
  const password =
    input.password ?? process.env.STANDARD_READER_APP_PASSWORD ?? "";
  return Boolean(identifier && password);
}

// ---------------------------------------------------------------------------
// Anonymous reads
// ---------------------------------------------------------------------------

const PLC_DIRECTORY = "https://plc.directory";
const PUBLIC_APPVIEW = "https://public.api.bsky.app";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new CliError(`${url} responded ${response.status}`);
  }
  return response.json();
}

/** The PDS endpoint and handle a DID document advertises. */
async function resolveDid(
  did: string,
): Promise<{ pds: string; handle: string }> {
  let document: unknown;
  if (did.startsWith("did:plc:")) {
    document = await fetchJson(`${PLC_DIRECTORY}/${did}`);
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replaceAll(":", "/");
    document = await fetchJson(`https://${host}/.well-known/did.json`);
  } else {
    throw new CliError(`Unsupported DID method: ${did}`);
  }

  if (!isRecord(document)) throw new CliError(`No DID document for ${did}`);
  const services = Array.isArray(document.service) ? document.service : [];
  const pds = services.find(
    (service): service is { serviceEndpoint: string } =>
      isRecord(service) &&
      service.type === "AtprotoPersonalDataServer" &&
      typeof service.serviceEndpoint === "string",
  )?.serviceEndpoint;
  if (!pds) throw new CliError(`${did} advertises no PDS in its DID document`);

  const aka = Array.isArray(document.alsoKnownAs) ? document.alsoKnownAs : [];
  const handle = aka.find(
    (entry): entry is string =>
      typeof entry === "string" && entry.startsWith("at://"),
  );
  return { handle: handle?.slice("at://".length) ?? did, pds };
}

/** A handle or DID → its DID. */
async function resolveIdentifier(identifier: string): Promise<string> {
  if (identifier.startsWith("did:")) return identifier;

  // The handle's own domain is authoritative and needs no third party.
  try {
    const response = await fetch(
      `https://${identifier}/.well-known/atproto-did`,
      { redirect: "follow" },
    );
    if (response.ok) {
      const body = await response.text();
      const text = body.trim();
      if (text.startsWith("did:")) return text;
    }
  } catch {
    // Fall through to the public resolver.
  }

  const resolved = await fetchJson(
    `${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(identifier)}`,
  );
  if (isRecord(resolved) && typeof resolved.did === "string") {
    return resolved.did;
  }
  throw new CliError(`Could not resolve "${identifier}" to a DID`);
}

/**
 * A read-only session against someone's PDS, with no credentials.
 *
 * `com.atproto.repo.listRecords` and `getBlob` are public, so surveying a repo
 * and converting it in memory needs no sign-in at all — only writing does. This
 * is what makes `list` and `convert --dry-run` runnable against any published
 * blog, including one you do not own.
 */
export async function openPublicSession(identifier: string): Promise<Session> {
  const did = await resolveIdentifier(identifier);
  const { pds, handle } = await resolveDid(did);
  return {
    canWrite: false,
    client: new Client({ handler: simpleFetchHandler({ service: pds }) }),
    did,
    handle,
    service: pds,
  };
}

export interface DocumentRecord {
  uri: string;
  cid: string;
  rkey: string;
  value: Record<string, unknown>;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `site.standard.document` in a repo, following the listRecords cursor. */
export async function listDocuments(
  session: Session,
  repo: string,
): Promise<Array<DocumentRecord>> {
  const out: Array<DocumentRecord> = [];
  let cursor: string | undefined;

  do {
    const page = await ok(
      session.client.get("com.atproto.repo.listRecords", {
        params: {
          collection: DOCUMENT_COLLECTION,
          cursor,
          limit: 100,
          repo,
        } as ListRecordsParams,
      }),
    );
    for (const entry of page.records) {
      if (!isRecord(entry.value)) continue;
      out.push({
        cid: entry.cid,
        rkey: rkeyOf(entry.uri),
        uri: entry.uri,
        value: entry.value,
      });
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return out;
}

/**
 * Replace a document's `content`, leaving every other field as it was.
 *
 * `swapRecord` pins the write to the CID we converted from, so a record edited
 * elsewhere between the read and the write fails loudly instead of being
 * silently overwritten with a conversion of stale content.
 */
export async function putDocumentContent(
  session: Session,
  input: {
    repo: string;
    rkey: string;
    record: Record<string, unknown>;
    content: Record<string, unknown>;
    swapRecord: string;
  },
): Promise<{ uri: string; cid: string }> {
  if (!session.canWrite) {
    throw new CliError(
      "This session is read-only. Sign in with --identifier and --password to write records.",
    );
  }
  const record = { ...input.record, content: input.content };
  const result = await ok(
    session.client.post("com.atproto.repo.putRecord", {
      input: {
        collection: DOCUMENT_COLLECTION,
        record,
        repo: input.repo,
        rkey: input.rkey,
        swapRecord: input.swapRecord,
      } as PutRecordInput,
    }),
  );
  return { cid: result.cid, uri: result.uri };
}

// ---------------------------------------------------------------------------
// Out-of-record content
// ---------------------------------------------------------------------------

const MAX_BLOB_BYTES = 4_000_000;

function blobCid(blob: unknown): string | null {
  if (!isRecord(blob)) return null;
  const ref = blob.ref;
  if (typeof ref === "string") return ref;
  if (!isRecord(ref)) return null;
  const link = ref.$link ?? ref["/"];
  return typeof link === "string" ? link : null;
}

async function fetchBlob(
  session: Session,
  did: string,
  cid: string,
): Promise<Response | null> {
  const url = new URL("/xrpc/com.atproto.sync.getBlob", session.service);
  url.searchParams.set("did", did);
  url.searchParams.set("cid", cid);
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const length = response.headers.get("content-length");
    if (length && Number(length) > MAX_BLOB_BYTES) return null;
    return response;
  } catch {
    return null;
  }
}

/**
 * Inline content that a large document parked in a blob.
 *
 * Leaflet, pckt and Markpub all move an oversized body out of the record and
 * leave a blob ref behind. The renderer's parsers only read inline bodies, so
 * without this step a big document looks empty and would convert to nothing —
 * the one failure mode that could quietly truncate someone's archive.
 */
export async function resolveContent(
  session: Session,
  did: string,
  content: unknown,
): Promise<unknown> {
  if (!isRecord(content)) return content;

  if (content.$type === "pub.leaflet.content") {
    if (Array.isArray(content.pages) && content.pages.length > 0)
      return content;
    const cid = blobCid(content.blobPages);
    if (!cid) return content;
    const response = await fetchBlob(session, did, cid);
    const pages: unknown = await response?.json().catch(() => null);
    return Array.isArray(pages) ? { ...content, pages } : content;
  }

  if (content.$type === "blog.pckt.content") {
    if (Array.isArray(content.items) && content.items.length > 0)
      return content;
    const cid = blobCid(content.blob);
    if (!cid) return content;
    const response = await fetchBlob(session, did, cid);
    const fetched: unknown = await response?.json().catch(() => null);
    const items = Array.isArray(fetched)
      ? fetched
      : isRecord(fetched) && Array.isArray(fetched.items)
        ? fetched.items
        : null;
    return items ? { ...content, items } : content;
  }

  if (content.$type === "at.markpub.markdown" && isRecord(content.text)) {
    const cid = blobCid(content.text.textBlob);
    if (!cid) return content;
    const response = await fetchBlob(session, did, cid);
    const markdown = await response?.text().catch(() => null);
    if (!markdown?.trim()) return content;
    return { ...content, text: { ...content.text, markdown } };
  }

  return content;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
