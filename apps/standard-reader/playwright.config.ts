import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PERF_TEST_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  globalSetup: "./perf/global-setup.ts",
  testDir: "./perf",
  testMatch: /load-regression\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "perf/report" }],
  ],
  timeout: Number(process.env.PERF_TEST_TIMEOUT_MS ?? 60_000),
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
