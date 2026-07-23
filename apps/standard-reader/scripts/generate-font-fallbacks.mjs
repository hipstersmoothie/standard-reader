// Generates metric-adjusted fallback @font-face rules so the system fallback
// occupies nearly the same space as the web font while it loads, eliminating
// the layout shift (CLS) when Newsreader / Atkinson / Spline Sans Mono swap in.
//
// Uses Capsize (@capsizecss/core + @capsizecss/metrics) to derive `size-adjust`,
// `ascent-override`, `descent-override`, and `line-gap-override` from each web
// font's real metrics vs. the chosen local fallback's metrics.
//
// The output is injected into src/styles.css between the @generated markers.
// The fallback family names produced here are referenced in the font stacks in
//   - src/components/reader/theme.ts (editorialFonts StyleX theme)
//   - src/magazine/magazine.css (--serif / --sans / --mono)
// Keep those stacks in sync if you change the fallback ordering below.
//
// Regenerate: `pnpm fonts:generate`

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFontStack } from "@capsizecss/core";
import appleSystem from "@capsizecss/metrics/appleSystem";
import arial from "@capsizecss/metrics/arial";
import atkinson from "@capsizecss/metrics/atkinsonHyperlegibleNext";
import courierNew from "@capsizecss/metrics/courierNew";
import georgia from "@capsizecss/metrics/georgia";
import newsreader from "@capsizecss/metrics/newsreader";
import splineSansMono from "@capsizecss/metrics/splineSansMono";
import timesNewRoman from "@capsizecss/metrics/timesNewRoman";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.join(__dirname, "..", "src", "styles.css");

const START =
  "/* @generated font-fallbacks:start — run `pnpm fonts:generate` */";
const END = "/* @generated font-fallbacks:end */";

// Each stack: [webFont, ...fallbacks]. Order the fallbacks so the platform that
// is most likely to render each one comes first.
const STACKS = [
  ["Newsreader", [newsreader, georgia, timesNewRoman]],
  ["Atkinson Hyperlegible Next", [atkinson, appleSystem, arial]],
  ["Spline Sans Mono", [splineSansMono, courierNew]],
];

const blocks = STACKS.map(([label, metrics]) => {
  const { fontFamily, fontFaces } = createFontStack(metrics);
  return `  /* ${label} — stack: ${fontFamily} */\n${fontFaces
    .trim()
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}`;
});

const generated = `${START}\n${blocks.join("\n\n")}\n  ${END}`;

const css = readFileSync(stylesPath, "utf8");
const pattern = new RegExp(
  `${START.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`)}[\\s\\S]*?${END.replaceAll(
    /[.*+?^${}()|[\]\\/]/g,
    String.raw`\$&`,
  )}`,
);

if (!pattern.test(css)) {
  throw new Error(
    `Could not find the @generated font-fallbacks markers in ${stylesPath}. ` +
      `Add:\n\n${START}\n${END}\n`,
  );
}

writeFileSync(stylesPath, css.replace(pattern, generated));
console.log(
  `Wrote metric-adjusted fallbacks to ${path.relative(process.cwd(), stylesPath)}`,
);
