import { describe, expect, it } from "vitest";

import {
  SUBSCRIBER_LIST_COLLECTION,
  SUBSCRIPTION_COLLECTION,
} from "../../lexicons/newsletter";
import type { SpaceRef } from "./space-uri";
import type { RepoOp } from "./spaces";
import { reconcileSpaceOps } from "./sync";

const SPACE: SpaceRef = {
  did: "did:plc:author",
  type: "app.standard-newsletter.list",
  skey: "pub1",
};

function op(partial: Partial<RepoOp>): RepoOp {
  return {
    id: "1",
    rev: "r1",
    idx: 0,
    action: "create",
    collection: SUBSCRIPTION_COLLECTION,
    rkey: "rk",
    did: "did:plc:sub",
    createdAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("reconcileSpaceOps", () => {
  it("maps a subscription record to a confirmed space subscriber", () => {
    const rows = reconcileSpaceOps(
      [op({ did: "did:plc:sub", rkey: "abc", value: { email: "S@X.com" } })],
      SPACE,
    );
    expect(rows).toEqual([
      {
        email: "s@x.com",
        subscriberDid: "did:plc:sub",
        source: "space",
        spaceRecordUri:
          "at://did:plc:author/space/app.standard-newsletter.list/pub1/did:plc:sub/app.standard-newsletter.subscription/abc",
        status: "confirmed",
      },
    ]);
  });

  it("expands the author subscriberList record into email subscribers", () => {
    const rows = reconcileSpaceOps(
      [
        op({
          did: "did:plc:author",
          collection: SUBSCRIBER_LIST_COLLECTION,
          rkey: "self",
          value: {
            entries: [
              { email: "a@x.com", addedAt: "2026-01-01T00:00:00Z" },
              {
                email: "b@x.com",
                addedAt: "2026-01-01T00:00:00Z",
                unsubscribedAt: "2026-02-01T00:00:00Z",
              },
            ],
          },
        }),
      ],
      SPACE,
    );
    expect(rows).toContainEqual({
      email: "a@x.com",
      source: "email",
      status: "confirmed",
    });
    expect(rows).toContainEqual({
      email: "b@x.com",
      source: "email",
      status: "unsubscribed",
    });
  });

  it("takes the latest op per record (delete → unsubscribed)", () => {
    const rows = reconcileSpaceOps(
      [
        op({ rkey: "abc", value: { email: "s@x.com" }, action: "create" }),
        op({ rkey: "abc", action: "delete" }),
      ],
      SPACE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("unsubscribed");
  });

  it("lets a confirmed row win over an unsubscribed one for the same email", () => {
    const rows = reconcileSpaceOps(
      [
        op({
          did: "did:plc:author",
          collection: SUBSCRIBER_LIST_COLLECTION,
          rkey: "self",
          value: {
            entries: [
              {
                email: "dup@x.com",
                addedAt: "2026-01-01T00:00:00Z",
                unsubscribedAt: "2026-01-02T00:00:00Z",
              },
            ],
          },
        }),
        op({ did: "did:plc:sub", rkey: "z", value: { email: "dup@x.com" } }),
      ],
      SPACE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
  });

  it("ignores unrelated collections and a deleted list record", () => {
    const rows = reconcileSpaceOps(
      [
        op({ collection: "app.bsky.feed.post", value: { text: "hi" } }),
        op({
          did: "did:plc:author",
          collection: SUBSCRIBER_LIST_COLLECTION,
          rkey: "self",
          action: "delete",
        }),
      ],
      SPACE,
    );
    expect(rows).toEqual([]);
  });
});
