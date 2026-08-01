import { test } from "@playwright/test";

import { hasPerfSignedInCredentials } from "../perf/lib/auth.ts";
import type { GuideShot } from "../src/lib/guide/screenshots.ts";
import { GUIDE_SHOTS } from "../src/lib/guide/screenshots.ts";
import { captureShot, resolveShotPath } from "./lib/capture.ts";

const TIMEOUT_MS = Number(process.env.GUIDE_SHOTS_TIMEOUT_MS ?? 45_000);

// `GUIDE_SHOTS` is `as const` so the app gets literal ids; widen it here so
// optional fields read uniformly across entries that do and don't set them.
const SHOTS: ReadonlyArray<GuideShot> = GUIDE_SHOTS;

/**
 * Refreshes every picture in the reader guide. One test per shot per scheme so
 * a single broken route reports as one failure instead of aborting the run.
 *
 * Run with `pnpm guide:shots` against a running dev server. Signed-in shots
 * reuse the perf suite's session bootstrap (`PERF_TEST_IDENTIFIER` +
 * `PERF_TEST_APP_PASSWORD`, or `PERF_TEST_SESSION_TOKEN`); without those they
 * skip rather than fail, so a contributor can still refresh the public pages.
 */
test.describe("guide screenshots", () => {
  const signedIn = hasPerfSignedInCredentials();

  for (const shot of SHOTS) {
    for (const scheme of shot.schemes) {
      const name = `${shot.id} (${scheme}) — ${shot.summary}`;

      test(name, async ({ browser }) => {
        test.skip(
          shot.auth === "signed-in" && !signedIn,
          "Set PERF_TEST_IDENTIFIER + PERF_TEST_APP_PASSWORD to capture signed-in screens.",
        );
        test.skip(
          resolveShotPath(shot.path) === null,
          `No fixture configured for "${shot.path}".`,
        );
        test.setTimeout(TIMEOUT_MS * 2);

        try {
          const result = await captureShot({
            browser,
            shot,
            scheme,
            timeoutMs: TIMEOUT_MS,
          });
          console.info(`✓ ${result.file}`);
        } catch (error) {
          if (shot.optional) {
            console.warn(
              `• skipped ${shot.id} (${scheme}): ${(error as Error).message}`,
            );
            test.skip(true, "Optional shot could not be captured.");
            return;
          }
          throw error;
        }
      });
    }
  }
});
