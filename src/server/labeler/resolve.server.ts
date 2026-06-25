/**
 * Standard labeler discovery.
 *
 * A labeler is just a DID. To use it we resolve the DID document, find its
 * `#atproto_labeler` service (type `AtprotoLabeler`), and talk to that endpoint:
 *   - `com.atproto.label.queryLabels` for the labels themselves
 *   - `app.standard-reader.labeler.getServices` for the descriptor (display name,
 *     label-value definitions) — the did:web equivalent of the labeler service
 *     record a did:plc labeler would publish in its repo.
 *
 * Nothing here is specific to claudeslop; it's discovered like any other labeler.
 */

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
  labelValueDefinitions?: Array<LabelValueDef>;
  indexedAt?: string;
}

interface DidDocument {
  id?: string;
  service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>;
}

const endpointCache = new Map<
  string,
  { at: number; endpoint: string | null }
>();
const viewCache = new Map<
  string,
  { at: number; view: ResolvedLabelerView | null }
>();
const ENDPOINT_TTL_MS = 5 * 60_000;
const VIEW_TTL_MS = 5 * 60_000;

async function fetchJson<T>(url: string, ms = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a DID to its DID document URL (did:web and did:plc supported). */
function didDocUrl(did: string): string | null {
  if (did.startsWith("did:plc:")) {
    return `https://plc.directory/${did}`;
  }
  if (did.startsWith("did:web:")) {
    const rest = did.slice("did:web:".length);
    const [hostPart, ...pathParts] = rest.split(":");
    const host = decodeURIComponent(hostPart);
    // Loopback hosts are served over http for local development.
    const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
      ? "http"
      : "https";
    const path = pathParts.map((p) => decodeURIComponent(p)).join("/");
    return path
      ? `${scheme}://${host}/${path}/did.json`
      : `${scheme}://${host}/.well-known/did.json`;
  }
  return null;
}

/** The base origin serving this labeler's XRPC endpoints, or null. */
export async function resolveLabelerEndpoint(
  did: string,
): Promise<string | null> {
  const cached = endpointCache.get(did);
  if (cached && Date.now() - cached.at < ENDPOINT_TTL_MS)
    return cached.endpoint;

  let endpoint: string | null = null;
  const url = didDocUrl(did);
  if (url) {
    const doc = await fetchJson<DidDocument>(url);
    const svc = doc?.service?.find(
      (s) => s.type === "AtprotoLabeler" || s.id === "#atproto_labeler",
    );
    endpoint = svc?.serviceEndpoint?.replace(/\/$/, "") ?? null;
  }
  endpointCache.set(did, { at: Date.now(), endpoint });
  return endpoint;
}

/** Resolve a handle or DID to a DID (handles via the well-known lookup). */
export async function resolveActorDid(actor: string): Promise<string | null> {
  if (actor.startsWith("did:")) return actor;
  // Try the HTTP well-known method (covers did:web-style hosts and many PDSes).
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

/** Resolve a labeler's descriptor (display name + label-value definitions). */
export async function resolveLabelerView(
  did: string,
): Promise<ResolvedLabelerView | null> {
  const cached = viewCache.get(did);
  if (cached && Date.now() - cached.at < VIEW_TTL_MS) return cached.view;

  let view: ResolvedLabelerView | null = null;
  const endpoint = await resolveLabelerEndpoint(did);
  if (endpoint) {
    const body = await fetchJson<{ views?: Array<Record<string, unknown>> }>(
      `${endpoint}/xrpc/app.standard-reader.labeler.getServices`,
    );
    const raw = body?.views?.[0];
    if (raw) {
      const policies = raw.policies as
        | { labelValueDefinitions?: Array<LabelValueDef> }
        | undefined;
      view = {
        did,
        displayName:
          typeof raw.displayName === "string" ? raw.displayName : undefined,
        description:
          typeof raw.description === "string" ? raw.description : undefined,
        labelValueDefinitions: policies?.labelValueDefinitions,
        indexedAt:
          typeof raw.indexedAt === "string" ? raw.indexedAt : undefined,
      };
    } else {
      // Reachable labeler with no descriptor — still a valid subscription.
      view = { did };
    }
  }
  viewCache.set(did, { at: Date.now(), view });
  return view;
}
