import type { Page } from "@playwright/test";

import type { PerfTarget } from "./targets.ts";
import { targetUrl } from "./targets.ts";

export interface LoadMeasurement {
  id: string;
  name: string;
  path: string;
  auth: PerfTarget["auth"];
  budgetMs: number;
  ms: number;
  url: string;
  status: number | null;
  overBudget: boolean;
}

/**
 * Ready = the app-shell `<main>` landmark is painted and nothing inside it is
 * still reporting `aria-busy` (route skeletons set it while their data loads).
 *
 * Anchors on `main#main-content` from `components/reader/app-shell.tsx` — every
 * measured target renders inside that shell. A previous marker
 * (`[data-app-scroller]`) no longer exists anywhere in `src/`, so this wait
 * silently timed out on every target and the whole suite failed at 45s.
 */
async function waitForViewReady(page: Page, timeoutMs: number): Promise<void> {
  // A signed-in target that bounces to /login never renders the shell, so the
  // landmark wait below would burn the full timeout and report a meaningless
  // "locator not visible". Surface the redirect instead.
  if (new URL(page.url()).pathname.startsWith("/login")) {
    throw new Error(
      `Redirected to ${page.url()} — the perf session was not accepted for this route. ` +
        `Check PERF_TEST_SESSION_TOKEN / PERF_TEST_APP_PASSWORD in .env.`,
    );
  }

  await page.locator("main#main-content").waitFor({
    state: "visible",
    timeout: timeoutMs,
  });

  await page.waitForFunction(
    () => {
      const main = document.querySelector("main#main-content");
      if (!main) return false;
      return main.querySelector("[aria-busy='true']") === null;
    },
    { timeout: timeoutMs },
  );
}

export async function measurePageLoad(
  page: Page,
  target: PerfTarget,
): Promise<LoadMeasurement> {
  const url = targetUrl(target);
  const started = performance.now();

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: target.timeoutMs,
  });

  await waitForViewReady(page, target.timeoutMs);

  const ms = Math.round(performance.now() - started);

  return {
    id: target.id,
    name: target.name,
    path: target.path,
    auth: target.auth,
    budgetMs: target.budgetMs,
    ms,
    url,
    status: response?.status() ?? null,
    overBudget: ms > target.budgetMs,
  };
}

export async function warmupTarget(
  page: Page,
  target: PerfTarget,
): Promise<void> {
  const url = targetUrl(target);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: target.timeoutMs,
  });
  await waitForViewReady(page, target.timeoutMs);
}
