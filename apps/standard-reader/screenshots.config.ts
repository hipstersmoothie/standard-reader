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
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
