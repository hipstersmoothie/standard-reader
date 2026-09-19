import { describe, expect, it, vi } from "vitest";

import {
  isHostUp,
  pickJetstreamService,
  probeJetstreamHost,
  resolveJetstreamService,
} from "./jetstream-endpoint.ts";

const EAST = "https://jetstream.us-east.bsky.network";
const WEST = "https://jetstream.us-west.bsky.network";

/** A `fetch` that answers each host with a fixed status, or throws. */
function fetchWith(statuses: Record<string, number | "throw">) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const host = Object.keys(statuses).find((h) => url.startsWith(h));
    const status = host ? statuses[host] : 404;
    if (status === "throw") throw new Error("ECONNREFUSED");
    return new Response(null, { status }) as Response;
  }) as unknown as typeof fetch;
}

describe("isHostUp", () => {
  // The probe is an unauthenticated GET at a procedure, so a healthy host
  // *rejects* it. Only 5xx means the load balancer has nothing behind it —
  // which is exactly what us-east served for 29 hours.
  it.each([200, 400, 401, 404, 405, 429])("treats %i as up", (status) => {
    expect(isHostUp(status)).toBe(true);
  });

  it.each([500, 502, 503, 504])("treats %i as down", (status) => {
    expect(isHostUp(status)).toBe(false);
  });
});

describe("probeJetstreamHost", () => {
  it("probes the planSnapshot endpoint", async () => {
    const fetchImpl = fetchWith({ [WEST]: 405 });
    await probeJetstreamHost(WEST, { fetchImpl });
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(String(url)).toBe(
      `${WEST}/xrpc/network.bsky.jetstream.planSnapshot`,
    );
  });

  it("reports a network failure as down rather than throwing", async () => {
    const fetchImpl = fetchWith({ [EAST]: "throw" });
    await expect(probeJetstreamHost(EAST, { fetchImpl })).resolves.toBe(false);
  });
});

describe("pickJetstreamService", () => {
  it("takes the first host that answers", async () => {
    const fetchImpl = fetchWith({ [EAST]: 405, [WEST]: 405 });
    await expect(
      pickJetstreamService([EAST, WEST], { fetchImpl }),
    ).resolves.toBe(EAST);
  });

  // The outage itself: the preferred region 503s, the next one is fine.
  it("skips a 503 host and falls through to the next", async () => {
    const fetchImpl = fetchWith({ [EAST]: 503, [WEST]: 405 });
    await expect(
      pickJetstreamService([EAST, WEST], { fetchImpl }),
    ).resolves.toBe(WEST);
  });

  it("stops probing once a host answers", async () => {
    const fetchImpl = fetchWith({ [EAST]: 405, [WEST]: 405 });
    await pickJetstreamService([EAST, WEST], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when every host is down", async () => {
    const fetchImpl = fetchWith({ [EAST]: 503, [WEST]: 503 });
    await expect(
      pickJetstreamService([EAST, WEST], { fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("resolveJetstreamService", () => {
  it("returns immediately when a host is up", async () => {
    const sleep = vi.fn(async () => {});
    await expect(
      resolveJetstreamService([EAST], {
        fetchImpl: fetchWith({ [EAST]: 405 }),
        sleep,
      }),
    ).resolves.toBe(EAST);
    expect(sleep).not.toHaveBeenCalled();
  });

  // The behaviour the outage needed and did not have: keep the process alive
  // and keep probing. Exiting is what let Railway stop the service for a day.
  it("waits and retries rather than giving up, then returns on recovery", async () => {
    let down = 2;
    const fetchImpl = vi.fn(async () => {
      if (down > 0) {
        down--;
        return new Response(null, { status: 503 }) as Response;
      }
      return new Response(null, { status: 405 }) as Response;
    }) as unknown as typeof fetch;
    const sleep = vi.fn(async () => {});

    await expect(
      resolveJetstreamService([EAST], { fetchImpl, sleep }),
    ).resolves.toBe(EAST);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially between rounds", async () => {
    const delays: Array<number> = [];
    await resolveJetstreamService([EAST], {
      fetchImpl: fetchWith({ [EAST]: 503 }),
      maxRounds: 5,
      sleep: async (ms) => {
        delays.push(ms);
      },
    }).catch(() => {});
    expect(delays).toEqual([5000, 10_000, 20_000, 40_000, 60_000]);
  });

  it("caps the backoff so a long outage still probes every minute", async () => {
    const delays: Array<number> = [];
    await resolveJetstreamService([EAST], {
      fetchImpl: fetchWith({ [EAST]: 503 }),
      maxRounds: 10,
      sleep: async (ms) => {
        delays.push(ms);
      },
    }).catch(() => {});
    expect(Math.max(...delays)).toBe(60_000);
  });

  it("rejects an empty host list rather than hanging", async () => {
    await expect(resolveJetstreamService([])).rejects.toThrow(
      /No Jetstream hosts configured/,
    );
  });
});
