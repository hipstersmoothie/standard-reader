/**
 * Regenerate public/banner-bsky.png (+ .svg), a square Bluesky banner.
 *
 * Bluesky displays banners at 3:1; uploading a square keeps it simple and
 * only the middle third (vertically) is shown. All content is centered in
 * that safe band; the rest is background bleed.
 *
 * Text is baked in as Newsreader variable-font outlines (same instances the
 * site renders with), so no fonts are needed at view time.
 *
 * Run: node scripts/generate-bsky-banner.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import * as fontkit from "fontkit";

const SIZE = 1500;
const CENTER = SIZE / 2;
const BACKGROUND = "#fcfbf6"; // manifest background_color
const ACCENT = "#c2502b"; // manifest theme_color
const MUTED = "#8a847a"; // OG palette muted

const WORDMARK = "Standard Reader";
const TAGLINE =
  "A warm reader for standard.site publications on the Atmosphere";

const WORDMARK_WIDTH = 1000;
const TAGLINE_WIDTH = 860;
const GAP = 72;

const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = join(tmpdir(), "standard-reader-icon-font");
const fontPath = join(fontDir, "Newsreader-variable.ttf");

await mkdir(fontDir, { recursive: true });
try {
  await readFile(fontPath);
} catch {
  const response = await fetch(FONT_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Font download failed: ${response.status}`);
  }
  await writeFile(fontPath, Buffer.from(await response.arrayBuffer()));
}

const baseFont = fontkit.openSync(fontPath);

/** Lay out a string with a variable-font instance; returns glyph paths + ink bbox in font units. */
function layoutText(text, variation) {
  // Glyph ids must come from the base font; getVariation loses the cmap.
  const baseRun = baseFont.layout(text);
  const instance = baseFont.getVariation(variation);

  const parts = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let x = 0;

  for (let i = 0; i < baseRun.glyphs.length; i++) {
    const pos = baseRun.positions[i];
    const glyph = instance.getGlyph(baseRun.glyphs[i].id);
    const gx = x + pos.xOffset;
    const gy = pos.yOffset;
    const b = glyph.bbox;
    if (Number.isFinite(b.minX)) {
      parts.push({ d: glyph.path.toSVG(), gx, gy });
      minX = Math.min(minX, b.minX + gx);
      minY = Math.min(minY, b.minY + gy);
      maxX = Math.max(maxX, b.maxX + gx);
      maxY = Math.max(maxY, b.maxY + gy);
    }
    x += pos.xAdvance;
  }

  return { parts, bbox: { minX, minY, maxX, maxY } };
}

/** SVG group: glyph outlines scaled to targetWidth, ink box centered at (cx, cy). */
function textGroup(layout, targetWidth, cx, cy, fill) {
  const { parts, bbox } = layout;
  const scale = targetWidth / (bbox.maxX - bbox.minX);
  const tx = cx - (scale * (bbox.minX + bbox.maxX)) / 2;
  const ty = cy + (scale * (bbox.minY + bbox.maxY)) / 2;
  const paths = parts
    .map((p) => `<path transform="translate(${p.gx} ${p.gy})" d="${p.d}" />`)
    .join("\n    ");
  return {
    inkHeight: scale * (bbox.maxY - bbox.minY),
    svg: `<g fill="${fill}" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)} ${-scale.toFixed(6)})">
    ${paths}
  </g>`,
  };
}

// Browsers cap optical sizing at opsz 72 for large display text.
const wordmarkLayout = layoutText(WORDMARK, { opsz: 72, wght: 500 });
const taglineLayout = layoutText(TAGLINE, { opsz: 40, wght: 400 });

// Measure ink heights first so the block (wordmark + gap + tagline) centers on CENTER.
const wordmarkScale =
  WORDMARK_WIDTH / (wordmarkLayout.bbox.maxX - wordmarkLayout.bbox.minX);
const taglineScale =
  TAGLINE_WIDTH / (taglineLayout.bbox.maxX - taglineLayout.bbox.minX);
const wordmarkH =
  wordmarkScale * (wordmarkLayout.bbox.maxY - wordmarkLayout.bbox.minY);
const taglineH =
  taglineScale * (taglineLayout.bbox.maxY - taglineLayout.bbox.minY);
const blockH = wordmarkH + GAP + taglineH;
const wordmarkCy = CENTER - blockH / 2 + wordmarkH / 2;
const taglineCy = CENTER + blockH / 2 - taglineH / 2;

const wordmark = textGroup(
  wordmarkLayout,
  WORDMARK_WIDTH,
  CENTER,
  wordmarkCy,
  ACCENT,
);
const tagline = textGroup(
  taglineLayout,
  TAGLINE_WIDTH,
  CENTER,
  taglineCy,
  MUTED,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}" />
  ${wordmark.svg}
  ${tagline.svg}
</svg>
`;

const svgPath = join(rootDir, "public", "banner-bsky.svg");
const pngPath = join(rootDir, "public", "banner-bsky.png");
await writeFile(svgPath, svg);
await writeFile(pngPath, new Resvg(svg).render().asPng());
console.log(
  `Block height ${Math.round(blockH)}px (safe band is ${SIZE / 3}px)`,
);
console.log(`Wrote ${svgPath}`);
console.log(`Wrote ${pngPath}`);
