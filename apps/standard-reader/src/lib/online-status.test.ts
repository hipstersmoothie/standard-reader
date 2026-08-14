// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The module keeps its verdict in module scope, so every test imports a fresh
 * copy after `vi.resetModules()`.
 */
async function load() {
  return await import("./online-status.ts");
}

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  setNavigatorOnLine(true);
});

describe("online status", () => {
  test("believes the browser when it claims a connection", async () => {
    setNavigatorOnLine(true);
    const { isOffline } = await load();
    expect(isOffline()).toBe(false);
    // Nothing to verify: a claimed connection is either true or about to fail a
    // real request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stays online when the browser misreports offline but the network answers", async () => {
    // Android WebView without `ACCESS_NETWORK_STATE`: `onLine` is `false` for
    // the life of the page on a perfectly good connection.
    setNavigatorOnLine(false);
    fetchMock.mockResolvedValue({});
    const { isOffline, subscribeToOnlineStatus } = await load();
    const seen: Array<boolean> = [];
    subscribeToOnlineStatus((online) => seen.push(online));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(isOffline()).toBe(false);
    // Never flipped, so nothing rebuilt the nav or renamed the wordmark.
    expect(seen).toEqual([]);
  });

  test("any HTTP answer counts as reachable, including an error status", async () => {
    setNavigatorOnLine(false);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { isOffline } = await load();
    // Reading the verdict is what wires the module up — nothing runs on import.
    expect(isOffline()).toBe(false);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(isOffline()).toBe(false);
  });

  test("goes offline when the probe fails at the network level", async () => {
    setNavigatorOnLine(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { isOffline, subscribeToOnlineStatus } = await load();
    const seen: Array<boolean> = [];
    subscribeToOnlineStatus((online) => seen.push(online));

    await vi.waitFor(() => {
      expect(isOffline()).toBe(true);
    });
    expect(seen).toEqual([false]);
  });

  test("recovers when a later probe succeeds", async () => {
    setNavigatorOnLine(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { isOffline, recheckOnlineStatus } = await load();
    await vi.waitFor(() => {
      expect(isOffline()).toBe(true);
    });

    fetchMock.mockResolvedValue({});
    recheckOnlineStatus();
    await vi.waitFor(() => {
      expect(isOffline()).toBe(false);
    });
  });

  test("the `online` event is believed without a probe", async () => {
    setNavigatorOnLine(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { isOffline } = await load();
    await vi.waitFor(() => {
      expect(isOffline()).toBe(true);
    });

    setNavigatorOnLine(true);
    globalThis.dispatchEvent(new Event("online"));
    expect(isOffline()).toBe(false);
  });

  test("probes a URL the service worker passes through, uncached", async () => {
    setNavigatorOnLine(false);
    fetchMock.mockResolvedValue({});
    const { recheckOnlineStatus } = await load();
    recheckOnlineStatus();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^\/robots\.txt\?online-probe=\d+$/);
    expect(init.cache).toBe("no-store");
  });
});
