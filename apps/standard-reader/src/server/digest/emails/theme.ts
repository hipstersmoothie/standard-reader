/**
 * Palette, fonts, and pure helpers shared by Standard's transactional emails.
 * Kept in a plain `.ts` module (no JSX/components) so the email components in
 * `./shared` can reuse it without tripping fast-refresh's single-export rule.
 *
 * Colors + fonts mirror the reader's editorial theme
 * (src/components/reader/theme.ts). Email can't use the theme's oklch/StyleX
 * tokens, so the light values are inlined in the `c` palette here and the dark
 * values live in the `<style>` block (see `EmailHead`), applied via the `d-*`
 * classes on each element (light + dark are the single place to retune).
 */

export const c = {
  page: "#f2ece1", // warm paper (outer background)
  card: "#fefdfc", // near-white warm (card surface) — primary.bg
  ink: "#3e332e", // primary.text2 — dark warm ink
  inkSoft: "#726b64", // ui.text1 — warm-gray secondary text
  muted: "#9a928a", // lighter warm gray — meta/counts/dates
  faint: "#b3aca2", // faint footer text
  line: "#e4ddd1", // warm hairline / card border
  accent: "#ad7f58", // primary.solid1 — solid accent
  accentInk: "#8a5f43", // accent text / links on paper
  solid2: "#a07553", // primary.solid2 — "Digest" wordmark accent
  white: "#ffffff",
} as const;

export const serif = "'Newsreader', Georgia, 'Times New Roman', serif";
export const sans =
  "'Atkinson Hyperlegible Next', system-ui, -apple-system, Helvetica, Arial, sans-serif";
export const mono = "'Spline Sans Mono', 'SFMono-Regular', Menlo, monospace";

// Deterministic warm/cool tone for a monogram fallback tile.
const MONO_COLORS = [
  "#c1603f",
  "#8a5170",
  "#4a4a55",
  "#3d7f8a",
  "#6f8348",
  "#b58a3e",
  "#a8455a",
  "#50525e",
];

export function monoTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + (seed.codePointAt(i) ?? 0)) % 2_147_483_647;
  }
  return MONO_COLORS[h % MONO_COLORS.length];
}

export function initials(name: string | null): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  const first = parts[0].charAt(0);
  const last = parts.at(-1)?.charAt(0) ?? "";
  return (first + last).toUpperCase();
}

export function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}
