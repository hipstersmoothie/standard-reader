import type { Client } from "@atcute/client";
import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "../errors";
import { mockAuth, mockXrpcContext } from "../test/helpers";
import { handleFollowUser } from "./writes";

describe("handleFollowUser", () => {
  it("rejects following yourself with a reason the caller can read", async () => {
    // A plain `Error` is masked as "Internal error" by `handleXrpcError`, which
    // will not leak non-XRPCError messages — so this used to answer
    // `400 InvalidRequest "Internal error"` and tell the caller nothing.
    // `scopes: null` is an app-password session: unrestricted repo access, so
    // the scope check passes and the self-follow guard is what runs.
    const auth = mockAuth({ client: {} as Client, scopes: null });
    const ctx = mockXrpcContext({ auth, body: { did: auth.did } });

    await expect(handleFollowUser(ctx)).rejects.toThrow(InvalidRequestError);
    await expect(handleFollowUser(ctx)).rejects.toThrow(
      /can't follow yourself/i,
    );
  });
});
