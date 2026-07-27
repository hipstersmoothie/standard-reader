import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as IdentityModule from "../atproto/identity.ts";
import { applyIdentity } from "./handlers.ts";

const { insertCalls, refreshIdentity } = vi.hoisted(() => ({
  insertCalls: [] as Array<{
    values: Record<string, unknown>;
    set: Record<string, unknown>;
  }>,
  refreshIdentity: vi.fn(),
}));

vi.mock("../../db/index.ts", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({
          set,
        }: {
          set: Record<string, unknown>;
        }) => {
          insertCalls.push({ values, set });
        },
      }),
    }),
  },
}));

vi.mock("../atproto/identity.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof IdentityModule>();
  return {
    ...actual,
    primeIdentityHandle: vi.fn(),
    refreshIdentity,
  };
});

describe("applyIdentity", () => {
  beforeEach(() => {
    insertCalls.length = 0;
    refreshIdentity.mockReset();
  });

  it("stores a usable handle and never resolves the DID doc", async () => {
    await applyIdentity({ did: "did:plc:a", handle: "qxm.de" });
    expect(refreshIdentity).not.toHaveBeenCalled();
    const [call] = insertCalls;
    expect(call.values.handle).toBe("qxm.de");
    expect(call.set.handle).toBe("qxm.de");
  });

  it("re-resolves the DID doc when the event carries handle.invalid", async () => {
    refreshIdentity.mockResolvedValue({
      did: "did:plc:b",
      pds: null,
      handle: "qxm.de",
    });
    await applyIdentity({ did: "did:plc:b", handle: "handle.invalid" });
    expect(refreshIdentity).toHaveBeenCalledWith("did:plc:b");
    const [call] = insertCalls;
    // The sentinel is never persisted; the resolved handle wins.
    expect(call.values.handle).toBe("qxm.de");
    expect(call.set.handle).toBe("qxm.de");
  });

  it("leaves the stored handle untouched when the sentinel can't be resolved", async () => {
    refreshIdentity.mockResolvedValue({
      did: "did:plc:c",
      pds: null,
      handle: null,
    });
    await applyIdentity({ did: "did:plc:c", handle: "handle.invalid" });
    const [call] = insertCalls;
    // Insert value is null (never the sentinel) but the conflict-update `set`
    // omits handle, so a good stored handle is not clobbered.
    expect(call.values.handle).toBeNull();
    expect(call.set).not.toHaveProperty("handle");
  });

  it("never persists handle.invalid even if the DID doc echoes it", async () => {
    refreshIdentity.mockResolvedValue({
      did: "did:plc:d",
      pds: null,
      handle: "handle.invalid",
    });
    await applyIdentity({ did: "did:plc:d", handle: "handle.invalid" });
    const [call] = insertCalls;
    expect(call.values.handle).toBeNull();
    expect(call.set).not.toHaveProperty("handle");
  });

  it("does not resolve or overwrite handle for a status-only event", async () => {
    await applyIdentity({ did: "did:plc:e", status: "deactivated" });
    expect(refreshIdentity).not.toHaveBeenCalled();
    const [call] = insertCalls;
    expect(call.values.handle).toBeNull();
    expect(call.set).not.toHaveProperty("handle");
    expect(call.set.isActive).toBe(false);
  });
});
