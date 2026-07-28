import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright project for refreshing the reader guide's screenshots
 * (`pnpm guide:shots`). Separate from `playwright.config.ts` — that one owns
 * the load-regression suite and has budgets and reporters this run doesn't
 * want — but it shares the perf suite's session bootstrap so signed-in screens
 * can be captured with the same credentials.
 */
const baseURL = process.env.PERF_TEST_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Sandboxes and CI images often ship one pinned Chromium that doesn't match the
 * build `@playwright/test` wants to download. Point `GUIDE_SHOTS_CHROMIUM` at
 * the binary that's already there rather than fetching another copy.
 */
const executablePath = process.env.GUIDE_SHOTS_CHROMIUM || undefined;

/**
 * Chromium does not inherit `HTTPS_PROXY` the way the shell tools do. Behind an
 * egress proxy that matters a great deal here: article cover images and every
 * avatar come from a remote CDN, so a browser that can't reach it produces
 * screenshots full of broken-image icons — which still pass, because the page
 * itself painted. Set `GUIDE_SHOTS_PROXY` to route the browser through one.
 *
 * Deliberately opt-in rather than inherited from `HTTPS_PROXY`: not every proxy
 * that shell tools use will accept Chromium's `CONNECT`, and silently pointing
 * the browser at one that doesn't just trades one failure for another.
 */
const proxyServer = process.env.GUIDE_SHOTS_PROXY;
const proxy = proxyServer
  ? { server: proxyServer, bypass: "127.0.0.1,localhost" }
  : undefined;

export default defineConfig({
  globalSetup: "./perf/global-setup.ts",
  testDir: "./screenshots",
  testMatch: /capture\.spec\.ts/,
  fullyParallel: false,
  // Screenshots are written by file name; concurrent contexts against one dev
  // server also make the page-ready wait flaky.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    proxy,
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: { executablePath },
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
