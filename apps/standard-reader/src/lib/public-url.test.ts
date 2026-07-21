import { afterEach, describe, expect, it, vi } from "vitest";

import { getCanonicalPublicUrl, getPublicUrl } from "./public-url.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public URL resolution", () => {
  it("getPublicUrl returns the preview railway domain on non-prod deploys", () => {
    vi.stubEnv("PUBLIC_URL", "https://standard-reader.app");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "web-pr-62.up.railway.app");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "pr-62");
    expect(getPublicUrl()).toBe("https://web-pr-62.up.railway.app");
  });

  it("getCanonicalPublicUrl ignores the railway override — prod domain even on a preview", () => {
    vi.stubEnv("PUBLIC_URL", "https://standard-reader.app");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "web-pr-62.up.railway.app");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "pr-62");
    expect(getCanonicalPublicUrl()).toBe("https://standard-reader.app");
  });

  it("both resolve to PUBLIC_URL in the production environment", () => {
    vi.stubEnv("PUBLIC_URL", "https://standard-reader.app");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "web.up.railway.app");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    expect(getPublicUrl()).toBe("https://standard-reader.app");
    expect(getCanonicalPublicUrl()).toBe("https://standard-reader.app");
  });

  it("strips a trailing slash and rewrites localhost", () => {
    vi.stubEnv("PUBLIC_URL", "http://localhost:3000/");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "");
    expect(getCanonicalPublicUrl()).toBe("http://127.0.0.1:3000");
  });
});
