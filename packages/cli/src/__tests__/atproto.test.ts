/**
 * Identity resolution and out-of-record content, against a stubbed network.
 *
 * `resolveContent` is the highest-consequence function in this package. Leaflet,
 * pckt and Markpub all park an oversized body in a blob and leave a ref behind;
 * if it is not inlined first, the parser sees an empty document, the converter
 * produces nothing, and a long article converts to a blank record. These tests
 * exist so that path cannot rot silently.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { CliError, openPublicSession, resolveContent } from "../atproto.js";
import type { Session } from "../atproto.js";

const DID = "did:plc:xgvzy7ni6ig6ievcbls5jaxe";
const PDS = "https://pds.example.com";

function didDocument(overrides: Record<string, unknown> = {}) {
  return {
    alsoKnownAs: ["at://writer.example"],
    id: DID,
    service: [
      {
        id: "#atproto_pds",
        serviceEndpoint: PDS,
        type: "AtprotoPersonalDataServer",
      },
    ],
    ...overrides,
  };
}

/** Route stubbed responses by URL substring; anything unmatched 404s. */
function stubFetch(routes: Record<string, unknown>) {
  return vi.fn((input: URL | string) => {
    const url = String(input);
    for (const [match, body] of Object.entries(routes)) {
      if (!url.includes(match)) continue;
      const isText = typeof body === "string";
      return Promise.resolve({
        headers: new Headers(isText ? { "content-length": "12" } : {}),
        json: () => Promise.resolve(body),
        ok: true,
        status: 200,
        text: () => Promise.resolve(isText ? body : JSON.stringify(body)),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("openPublicSession", () => {
  it("resolves a handle through its own domain first", async () => {
    const fetchMock = stubFetch({
      "/.well-known/atproto-did": DID,
      "plc.directory": didDocument(),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await openPublicSession("writer.example");

    expect(session.did).toBe(DID);
    expect(session.service).toBe(PDS);
    expect(session.handle).toBe("writer.example");
    expect(session.canWrite).toBe(false);
    // The handle's own domain is authoritative, so no third party was asked.
    const called = fetchMock.mock.calls.map(([url]) => String(url));
    expect(called.some((url) => url.includes("public.api.bsky.app"))).toBe(
      false,
    );
  });

  it("falls back to the public resolver when the domain has no record", async () => {
    globalThis.fetch = stubFetch({
      "com.atproto.identity.resolveHandle": { did: DID },
      "plc.directory": didDocument(),
    }) as unknown as typeof fetch;

    const session = await openPublicSession("writer.example");

    expect(session.did).toBe(DID);
    expect(session.service).toBe(PDS);
  });

  it("takes a DID directly, skipping handle resolution", async () => {
    globalThis.fetch = stubFetch({
      "plc.directory": didDocument(),
    }) as unknown as typeof fetch;

    const session = await openPublicSession(DID);

    expect(session.handle).toBe("writer.example");
  });

  it("reads a did:web document from its host", async () => {
    globalThis.fetch = stubFetch({
      "/.well-known/did.json": didDocument({ alsoKnownAs: [] }),
    }) as unknown as typeof fetch;

    const session = await openPublicSession("did:web:blog.example");

    expect(session.service).toBe(PDS);
    // No `alsoKnownAs` to name it by, so the DID stands in for the handle.
    expect(session.handle).toBe("did:web:blog.example");
  });

  it("says so when the DID advertises no PDS", async () => {
    globalThis.fetch = stubFetch({
      "plc.directory": didDocument({ service: [] }),
    }) as unknown as typeof fetch;

    await expect(openPublicSession(DID)).rejects.toThrow(/advertises no PDS/);
  });

  it("refuses a DID method it cannot resolve", async () => {
    globalThis.fetch = stubFetch({}) as unknown as typeof fetch;

    await expect(openPublicSession("did:example:abc")).rejects.toThrow(
      CliError,
    );
  });

  it("reports an unresolvable handle rather than guessing", async () => {
    globalThis.fetch = stubFetch({}) as unknown as typeof fetch;

    await expect(openPublicSession("nobody.example")).rejects.toThrow(CliError);
  });
});

describe("resolveContent — inlining a body parked in a blob", () => {
  const session = { service: PDS } as Session;
  const blob = { $type: "blob", ref: { $link: "bafyblobcid" } };

  it("fetches Leaflet pages when the record has none inline", async () => {
    const pages = [{ $type: "pub.leaflet.pages.linearDocument", blocks: [] }];
    globalThis.fetch = stubFetch({
      "com.atproto.sync.getBlob": pages,
    }) as unknown as typeof fetch;

    const resolved = await resolveContent(session, DID, {
      $type: "pub.leaflet.content",
      blobPages: blob,
      pages: [],
    });

    expect((resolved as { pages: unknown }).pages).toEqual(pages);
  });

  it("leaves an already-inline Leaflet body alone", async () => {
    const fetchMock = stubFetch({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const content = {
      $type: "pub.leaflet.content",
      blobPages: blob,
      pages: [{ $type: "pub.leaflet.pages.linearDocument", blocks: [] }],
    };

    expect(await resolveContent(session, DID, content)).toBe(content);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts either shape a pckt blob can hold", async () => {
    const items = [{ $type: "blog.pckt.block.text", plaintext: "hi" }];

    globalThis.fetch = stubFetch({
      "com.atproto.sync.getBlob": items,
    }) as unknown as typeof fetch;
    const bare = await resolveContent(session, DID, {
      $type: "blog.pckt.content",
      blob,
      items: [],
    });
    expect((bare as { items: unknown }).items).toEqual(items);

    globalThis.fetch = stubFetch({
      "com.atproto.sync.getBlob": { items },
    }) as unknown as typeof fetch;
    const wrapped = await resolveContent(session, DID, {
      $type: "blog.pckt.content",
      blob,
      items: [],
    });
    expect((wrapped as { items: unknown }).items).toEqual(items);
  });

  it("inlines a Markpub text blob over the record's markdown", async () => {
    globalThis.fetch = stubFetch({
      "com.atproto.sync.getBlob": "# From the blob",
    }) as unknown as typeof fetch;

    const resolved = await resolveContent(session, DID, {
      $type: "at.markpub.markdown",
      text: { $type: "at.markpub.text", markdown: "", textBlob: blob },
    });

    expect((resolved as { text: { markdown: string } }).text.markdown).toBe(
      "# From the blob",
    );
  });

  it("returns the record unchanged when the blob cannot be fetched", async () => {
    // Better to convert what is inline (and report an empty body) than to
    // throw away the record because a blob fetch failed.
    globalThis.fetch = stubFetch({}) as unknown as typeof fetch;
    const content = {
      $type: "pub.leaflet.content",
      blobPages: blob,
      pages: [],
    };

    expect(await resolveContent(session, DID, content)).toBe(content);
  });

  it("passes through content with no blob to resolve", async () => {
    const fetchMock = stubFetch({});
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const content = { $type: "app.offprint.content", items: [] };

    expect(await resolveContent(session, DID, content)).toBe(content);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
