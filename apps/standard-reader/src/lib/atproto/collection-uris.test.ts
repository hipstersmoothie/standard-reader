import { describe, expect, it } from "vitest";

import {
  collectionDocumentLink,
  collectionDocumentUri,
  collectionSidecarUri,
} from "#/lib/atproto/collection-uris";

describe("collection document pair URIs", () => {
  const did = "did:plc:abc";
  const rkey = "3jzexample";

  it("builds matching document and sidecar URIs from one rkey", () => {
    expect(collectionDocumentUri(did, rkey)).toBe(
      `at://${did}/site.standard.document/${rkey}`,
    );
    expect(collectionSidecarUri(did, rkey)).toBe(
      `at://${did}/app.standard-reader.collection/${rkey}`,
    );
  });

  it("builds the inverse document link entry", () => {
    const sidecarUri = collectionSidecarUri(did, rkey);
    expect(collectionDocumentLink(sidecarUri)).toEqual({
      $type: "app.standard-reader.collection#documentLink",
      uri: sidecarUri,
    });
  });
});
