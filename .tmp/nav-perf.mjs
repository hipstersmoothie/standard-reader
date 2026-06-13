import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";

function decodeServerFn(url) {
  const m = url.match(/_serverFn\/([^?]+)/);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(decodeURIComponent(m[1]), "base64").toString(),
    );
    const file = (json.file || "")
      .replace("/src/integrations/tanstack-query/", "")
      .replace("?tss-serverfn-split", "");
    return `${file}#${json.export}`;
  } catch {
    return "_serverFn/<undecodable>";
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

const requests = [];
let t0 = 0;
page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("_serverFn") && !url.includes("/api/")) return;
  requests.push({
    url: decodeServerFn(url) ?? url.replace(BASE, "").slice(0, 110),
    start: Date.now() - t0,
    req,
  });
});
page.on("requestfinished", (req) => {
  const r = requests.find((x) => x.req === req);
  if (r) r.end = Date.now() - t0;
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && t0) {
    console.log(
      `[framenavigated -> ${frame.url().replace(BASE, "")} at +${Date.now() - t0}ms]`,
    );
  }
});

await page.goto(BASE + "/latest", { waitUntil: "load" });
await page.waitForTimeout(5000);

// find a real article link rendered by the router
const link = page.locator('a[href^="/a/"]').first();
const href = await link.getAttribute("href");
console.log("clicking article link:", href);
requests.length = 0;

t0 = Date.now();
await link.click({ noWaitAfter: true });
await page.waitForURL("**/a/**", { timeout: 60_000 });
const tUrl = Date.now() - t0;
await page.waitForSelector("h1", { timeout: 60_000 });
const tRender = Date.now() - t0;
await page.waitForTimeout(2500);

console.log(`\nURL changed after: ${tUrl}ms`);
console.log(`h1 rendered after: ${tRender}ms`);
console.log("\nServer/API requests after click:");
for (const r of requests.toSorted((a, b) => a.start - b.start)) {
  const dur = r.end ? r.end - r.start : Number.NaN;
  console.log(
    `  +${String(r.start).padStart(5)}ms  ${String(dur).padStart(5)}ms  ${r.url}`,
  );
}

await browser.close();
