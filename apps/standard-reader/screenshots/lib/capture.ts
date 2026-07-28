import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";

import { applyPerfSessionCookie } from "../../perf/lib/auth.ts";
import { perfBaseUrl } from "../../perf/lib/config.ts";
import { loadPerfFixtures } from "../../perf/lib/fixtures.ts";
import type {
  GuideShot,
  GuideShotScheme,
} from "../../src/lib/guide/screenshots.ts";
import {
  GUIDE_SHOTS_OUTPUT_DIR,
  guideShotFileName,
} from "../../src/lib/guide/screenshots.ts";
import { THEME_COOKIE } from "../../src/lib/theme.ts";

/**
 * Paths in the shot manifest may reference a fixture instead of hard-coding a
 * record that could be deleted from the network. Resolve those against the
 * same `PERF_TEST_*` env the perf suite already uses.
 */
export function resolveShotPath(shotPath: string): string | null {
  const fixtures = loadPerfFixtures();
  const replacements: Record<string, string | null> = {
    "{article}": fixtures.articlePath,
    "{publication}": fixtures.publicationPath,
    "{tag}": fixtures.tag,
  };

  let resolved = shotPath;
  for (const [token, value] of Object.entries(replacements)) {
    if (!resolved.includes(token)) continue;
    if (!value) return null;
    resolved = resolved.replaceAll(token, value);
  }
  return resolved;
}

/**
 * Ready = the app shell's `<main>` landmark is painted and nothing inside it
 * still reports `aria-busy`. Same signal the perf suite measures against
 * (`perf/lib/measure.ts`), so a screenshot never catches a skeleton.
 */
async function waitForShotReady(page: Page, timeoutMs: number): Promise<void> {
  const main = page.locator("main#main-content");
  if ((await main.count()) > 0) {
    await main.waitFor({ state: "visible", timeout: timeoutMs });
  }

  await page.waitForFunction(
    () => document.querySelector("[aria-busy='true']") === null,
    { timeout: timeoutMs },
  );

  // Fonts finish after the busy flags clear; a shot taken mid-swap shows the
  // fallback stack.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export interface CaptureResult {
  file: string;
  path: string;
}

export async function captureShot({
  browser,
  shot,
  scheme,
  timeoutMs,
}: {
  browser: Browser;
  shot: GuideShot;
  scheme: GuideShotScheme;
  timeoutMs: number;
}): Promise<CaptureResult> {
  const resolvedPath = resolveShotPath(shot.path);
  if (!resolvedPath) {
    throw new Error(
      `No fixture configured for "${shot.path}" — set the matching PERF_TEST_* var in .env.`,
    );
  }

  const context = await browser.newContext({
    viewport: shot.viewport,
    // Retina output: the guide renders these at their CSS size, so 2x keeps
    // text crisp on the displays people read the guide on.
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    colorScheme: scheme,
  });

  try {
    const base = new URL(perfBaseUrl());
    await context.addCookies([
      {
        name: THEME_COOKIE,
        value: scheme,
        domain: base.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);

    if (shot.auth === "signed-in") {
      await applyPerfSessionCookie(context);
    }

    const page = await context.newPage();
    await page.goto(resolvedPath, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await waitForShotReady(page, timeoutMs);

    for (const interaction of shot.interactions ?? []) {
      await page
        .getByRole(interaction.role, {
          name: new RegExp(escapeRegExp(interaction.name), "i"),
        })
        .first()
        .click({ timeout: timeoutMs });
      await waitForShotReady(page, timeoutMs);
    }

    const file = guideShotFileName(shot.id, scheme);
    const outputPath = path.join(process.cwd(), GUIDE_SHOTS_OUTPUT_DIR, file);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, animations: "disabled" });

    return { file, path: outputPath };
  } finally {
    await context.close();
  }
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
