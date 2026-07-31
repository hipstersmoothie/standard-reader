/**
 * Firefox magazine layout probe — run with dev server up:
 *   pnpm exec node scripts/inspect-magazine-firefox.mjs
 */
import { chromium, firefox } from "@playwright/test";

const url =
  "http://127.0.0.1:3000/collection/did:plc:m2sjv3wncvsasdapla35hzwj/3moeyixgdmk2r";

const VIEWPORT = { width: 1362, height: 865 };

async function inspect(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.waitForSelector(".mag-flow, .mag-flow-rail", { timeout: 60_000 });
  await page.waitForFunction(
    () => !document.querySelector(".building[aria-busy='true']"),
    { timeout: 90_000 },
  );
  await page.waitForTimeout(8000);

  const report = await page.evaluate(() => {
    const flow =
      document.querySelector(".mag-flow-rail") ??
      document.querySelector(".mag-flow");
    if (!flow) return { error: "no flow" };

    const flowRect = flow.getBoundingClientRect();
    const style = getComputedStyle(flow);
    const colWidth = Number.parseFloat(style.columnWidth) || 0;
    const regionsMode = document
      .querySelector(".mag")
      ?.classList.contains("regions-mode");
    const regionCount = document.querySelectorAll(".mag-region").length;
    const pitch =
      colWidth > 0
        ? colWidth + (Number.parseFloat(style.columnGap) || 0)
        : flow.querySelector(".mag-region")
          ? (flow.querySelector(".mag-region")?.getBoundingClientRect().width ??
              0) +
            (Number.parseFloat(
              getComputedStyle(flow.querySelector(".mag-region")).marginRight,
            ) || 0)
          : 0;

    function colInfo(el) {
      const r = el.getBoundingClientRect();
      const colIndex =
        pitch > 0 ? Math.round((r.left - flowRect.left) / pitch) : 0;
      const topOffset = r.top - flowRect.top;
      return {
        className: el.className,
        colIndex,
        topOffset: Math.round(topOffset),
        atColumnTop: topOffset <= 14,
        text: (el.textContent ?? "")
          .slice(0, 70)
          .replaceAll(/\s+/g, " ")
          .trim(),
      };
    }

    const muHeadline = [...document.querySelectorAll(".headline")].find((el) =>
      el.textContent?.toLowerCase().includes("announcing mu.social"),
    );

    return {
      regionsMode,
      regionCount,
      flowHeight: flow.clientHeight,
      colWidth,
      pitch: Math.round(pitch),
      flowScrollWidth: flow.scrollWidth,
      hasNamedFlow: typeof document.getNamedFlow === "function",
      namedFlowOverset: document.getNamedFlow?.("mag-issue")?.overset ?? null,
      muSocial: muHeadline ? colInfo(muHeadline) : null,
      muOpener: muHeadline?.closest(".opener")
        ? colInfo(muHeadline.closest(".opener"))
        : null,
    };
  });

  await browser.close();
  return { label, viewport: VIEWPORT, ...report };
}

const results = [];
for (const [browserType, label] of [
  [firefox, "firefox"],
  [chromium, "chromium"],
]) {
  results.push(await inspect(browserType, label));
}
console.log(JSON.stringify(results, null, 2));
