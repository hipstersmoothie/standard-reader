import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { LoadMeasurement } from "./lib/measure.ts";
import type { PerfTarget } from "./lib/targets.ts";

import {
  applyPerfSessionCookie,
  hasPerfSignedInCredentials,
} from "./lib/auth.ts";
import {
  perfBaseUrl,
  perfBudgetMultiplier,
  perfWarmupPasses,
} from "./lib/config.ts";
import { loadPerfFixtures } from "./lib/fixtures.ts";
import { measurePageLoad, warmupTarget } from "./lib/measure.ts";
import {
  formatMeasurementLine,
  writePerfComparisonReport,
  writePerfReport,
} from "./lib/report.ts";
import { guestTargets, signedInTargets } from "./lib/targets.ts";

const guestResults: Array<LoadMeasurement> = [];
const signedInResults: Array<LoadMeasurement> = [];

async function runTarget(
  page: Page,
  target: PerfTarget,
  bucket: Array<LoadMeasurement>,
): Promise<void> {
  const warmup = perfWarmupPasses();
  for (let i = 0; i < warmup; i++) {
    await warmupTarget(page, target);
  }

  const result = await measurePageLoad(page, target);
  bucket.push(result);

  await test.info().attach(`${target.id}-timing`, {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });

  expect(result.ms, formatMeasurementLine(result)).toBeLessThanOrEqual(
    target.budgetMs,
  );
}

function skipIfMissingFixture(target: PerfTarget): boolean {
  if (target.required !== false) return false;
  const fixtures = loadPerfFixtures();
  if (target.id === "publication") return fixtures.publicationPath == null;
  if (target.id === "article") return fixtures.articlePath == null;
  return false;
}

test.describe("load regression — guest", () => {
  test.beforeAll(() => {
    test.info().annotations.push({
      type: "perf-base-url",
      description: perfBaseUrl(),
    });
  });

  for (const target of guestTargets()) {
    test(target.name, async ({ page }) => {
      test.skip(skipIfMissingFixture(target), "fixture env not configured");
      await runTarget(page, target, guestResults);
    });
  }

  test.afterAll(() => {
    if (guestResults.length === 0) return;
    writePerfReport(guestResults, {
      mode: "guest",
      baseUrl: perfBaseUrl(),
      budgetMultiplier: perfBudgetMultiplier(),
    });
  });
});

test.describe("load regression — signed in", () => {
  test.beforeAll(() => {
    test.skip(
      !hasPerfSignedInCredentials(),
      "Set PERF_TEST_IDENTIFIER + PERF_TEST_APP_PASSWORD in .env (see .env.example)",
    );
  });

  test.beforeEach(async ({ context }) => {
    if (!hasPerfSignedInCredentials()) return;
    await applyPerfSessionCookie(context);
  });

  for (const target of signedInTargets()) {
    test(target.name, async ({ page }) => {
      test.skip(
        !hasPerfSignedInCredentials(),
        "PERF_TEST_IDENTIFIER + PERF_TEST_APP_PASSWORD not set",
      );

      await runTarget(page, target, signedInResults);
    });
  }

  test.afterAll(() => {
    if (!hasPerfSignedInCredentials() || signedInResults.length === 0) return;
    writePerfReport(signedInResults, {
      mode: "signed-in",
      baseUrl: perfBaseUrl(),
      budgetMultiplier: perfBudgetMultiplier(),
    });
  });
});

test.afterAll(() => {
  if (guestResults.length === 0 || signedInResults.length === 0) return;
  writePerfComparisonReport(guestResults, signedInResults, {
    baseUrl: perfBaseUrl(),
    budgetMultiplier: perfBudgetMultiplier(),
  });
});
