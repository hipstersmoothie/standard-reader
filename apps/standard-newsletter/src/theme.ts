/**
 * Standard Newsletter's warm editorial palette ("Almanac"). Kept as a local
 * constants object rather than StyleX theme vars so the marketing chrome and
 * analytics screens stay self-contained and independent of the reader's default
 * (mauve) theme; per-publication colors come from each publication's own theme.
 */
export const C = {
  pageBg: "#f5f1ea",
  warm: "#faf7f1",
  ui3: "#ece6db",
  hover4: "#f0eae0",
  sel5: "#efe7d9",
  b6: "#e4ddd0",
  b7: "#d8cfc0",
  b8: "#cabfad",
  a9: "#ad7f58",
  a11: "#6f5636",
  t12: "#241d18",
  mut: "#8c8074",
  serif: "'Newsreader', ui-serif, Georgia, serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Spline Sans Mono', ui-monospace, Menlo, monospace",
  ink: "#241d18",
} as const;

/** Semantic accents: positive/negative deltas, delivery health. */
export const POS = "#3f7d4e";
export const POSD = "#4a9d6b";
export const NEG = "#a33a2a";

export const fmt = (n: number): string => n.toLocaleString("en-US");

export const kfmt = (n: number): string =>
  n >= 1000
    ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".0", "")}k`
    : String(n);

export const sectLabel = {
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: C.mut,
  marginBottom: 12,
};

export const cardBox = {
  border: `1px solid ${C.b6}`,
  borderRadius: 16,
  background: C.warm,
};
