/**
 * A Standard Reader AppView client, in the three shapes an outside integration
 * can take. All three carry the same identity; they differ in how that identity
 * reaches the AppView.
 */

import type { AppviewIdentity } from "./identity";
import type { Session } from "./session";
import { mintServiceJwt } from "./session";

/**
 * - `direct` — talk to the AppView and present your PDS access token. Simplest,
 *   and the only transport that can make the AppView write to your repo for
 *   you, because it is the only one the AppView can replay at your PDS.
 * - `proxy` — talk to your own PDS with an `atproto-proxy` header. The PDS
 *   resolves our DID document, mints a service JWT and forwards the call. Reads
 *   only: the token that arrives proves who you are but cannot write.
 * - `serviceAuth` — mint the same service JWT yourself and present it directly.
 *   Equivalent to `proxy` without the extra hop; useful for debugging which
 *   side of a proxied call is failing.
 */
export type Transport = "direct" | "proxy" | "serviceAuth";

export type XrpcResult = {
  body: unknown;
  ok: boolean;
  raw: string;
  status: number;
};

export type CallOptions = {
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  params?: Record<string, string | Array<string>>;
  /** Omit the credential entirely, to see what an anonymous caller gets. */
  anonymous?: boolean;
};

export class StandardReaderClient {
  constructor(
    private readonly appview: AppviewIdentity,
    private readonly session: Session,
    private readonly transport: Transport,
  ) {}

  get name(): Transport {
    return this.transport;
  }

  async call(nsid: string, options: CallOptions = {}): Promise<XrpcResult> {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const base =
      this.transport === "proxy"
        ? this.session.pds
        : this.appview.serviceEndpoint;
    const url = new URL(`/xrpc/${nsid}`, base);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      // An array-typed lexicon parameter repeats the key, it is not joined.
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, item);
      }
    }

    const headers = new Headers({ accept: "application/json" });
    if (!options.anonymous) {
      headers.set("authorization", await this.authorization(nsid));
      if (this.transport === "proxy") {
        headers.set("atproto-proxy", this.appview.proxyTarget);
      }
    }
    if (options.body) headers.set("content-type", "application/json");

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      // Leave the raw text — a non-JSON body is itself the finding.
    }
    return { body, ok: response.ok, raw, status: response.status };
  }

  private async authorization(nsid: string): Promise<string> {
    if (this.transport === "serviceAuth") {
      // The audience is the *bare* DID: a PDS strips the `#fragment` off
      // `atproto-proxy` before signing, so that is what the AppView must accept.
      const token = await mintServiceJwt(this.session, this.appview.did, nsid);
      return `Bearer ${token}`;
    }
    return `Bearer ${this.session.accessJwt}`;
  }
}
