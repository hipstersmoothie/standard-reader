/**
 * AT Protocol identity resolution — everything an outside client needs before
 * it can talk to Standard Reader. No SDK, so the steps stay visible.
 */

export type DidDocument = {
  id?: string;
  service?: Array<{ id?: string; serviceEndpoint?: string; type?: string }>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Resolve a handle to a DID via the public AppView. */
export async function resolveHandle(handle: string): Promise<string> {
  if (handle.startsWith("did:")) return handle;
  const { did } = await getJson<{ did: string }>(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  return did;
}

/** Fetch a DID document for `did:plc:…` or `did:web:…`. */
export async function resolveDidDocument(did: string): Promise<DidDocument> {
  if (did.startsWith("did:plc:")) {
    return getJson<DidDocument>(`https://plc.directory/${did}`);
  }
  if (did.startsWith("did:web:")) {
    // Dots stay; colons after the method encode *path* segments.
    const [host, ...segments] = did.slice("did:web:".length).split(":");
    const path =
      segments.length > 0 ? `/${segments.join("/")}` : "/.well-known";
    return getJson<DidDocument>(
      `https://${decodeURIComponent(host ?? "")}${path}/did.json`,
    );
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

/** The PDS that hosts a repo. */
export async function resolvePds(did: string): Promise<string> {
  const doc = await resolveDidDocument(did);
  const endpoint = doc.service?.find(
    (service) => service.id === "#atproto_pds",
  )?.serviceEndpoint;
  if (!endpoint) throw new Error(`No #atproto_pds service on ${did}`);
  return endpoint.replace(/\/+$/, "");
}

export type AppviewIdentity = {
  /** The DID to put in an `atproto-proxy` header, including the fragment. */
  proxyTarget: string;
  /** The bare DID, which is what a PDS signs a service JWT's `aud` with. */
  did: string;
  serviceEndpoint: string;
};

/**
 * Discover the AppView the way a PDS does, and reject the two shapes that
 * silently break proxying:
 *
 * - an `id` that does not match the DID we asked for (a resolver treats a
 *   self-inconsistent document as spoofed);
 * - a `serviceEndpoint` with a path, which a PDS passes verbatim to its HTTP
 *   dispatcher as an origin and cannot use.
 */
export async function resolveAppview(
  baseUrl: string,
  serviceId = "standard_reader_appview",
): Promise<AppviewIdentity> {
  const host = new URL(baseUrl).hostname;
  const did = `did:web:${host}`;
  const doc = await getJson<DidDocument>(`${baseUrl}/.well-known/did.json`);

  if (doc.id !== did) {
    throw new Error(
      `DID document at ${baseUrl} claims id "${doc.id}" but resolves as "${did}" — no compliant resolver will accept it`,
    );
  }
  const service = doc.service?.find(
    (entry) =>
      entry.id === `#${serviceId}` || entry.id === `${did}#${serviceId}`,
  );
  const serviceEndpoint = service?.serviceEndpoint;
  if (!serviceEndpoint) {
    throw new Error(`DID document has no #${serviceId} service`);
  }
  if (new URL(serviceEndpoint).pathname !== "/") {
    throw new Error(
      `serviceEndpoint "${serviceEndpoint}" has a path; it must be a bare origin`,
    );
  }
  return { did, proxyTarget: `${did}#${serviceId}`, serviceEndpoint };
}
