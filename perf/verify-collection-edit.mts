import { chromium } from "@playwright/test";

import { bootstrapAppPasswordSession } from "../src/integrations/auth/app-password-session.server.ts";
import { AUTH_SESSION_TOKEN_COOKIE } from "../src/integrations/auth/constants.ts";

const BASE = process.env.PERF_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const identifier = process.env.PERF_TEST_IDENTIFIER!;
const password = process.env.PERF_TEST_APP_PASSWORD!;

const { sessionToken } = await bootstrapAppPasswordSession(identifier, password);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 1400 },
  deviceScaleFactor: 2,
});
await context.addCookies([
  {
    name: AUTH_SESSION_TOKEN_COOKIE,
    value: sessionToken,
    domain: new URL(BASE).hostname,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`${BASE}/collections`, { waitUntil: "domcontentloaded" });
await page.screenshot({ path: "perf/_collections.png", fullPage: true });

// Find the first "edit" link.
const editHref = await page
  .locator('a[href*="/collections/edit/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);
console.log("edit href:", editHref);

if (editHref) {
  await page.goto(`${BASE}${editHref}`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Edit collection" })
    .waitFor({ timeout: 8000 })
    .catch(() => console.log("no Edit collection heading"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "perf/_collection-edit.png", fullPage: true });
  console.log(
    "edit body:",
    (await page.locator("body").innerText()).slice(0, 200),
  );
}

await page.goto(`${BASE}/collections/new`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.screenshot({ path: "perf/_collection-new.png", fullPage: true });

await browser.close();
console.log("done");
