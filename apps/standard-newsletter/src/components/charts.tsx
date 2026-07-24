import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  svg: {
    display: "block",
    overflow: "visible",
  },
  /** Horizontal guides behind the curve. */
  guide: {
    stroke: uiColor.border1,
  },
  /** The curve itself, and the dot marking the latest reading. */
  line: {
    fill: "none",
    stroke: primaryColor.solid1,
  },
  marker: {
    fill: primaryColor.solid1,
  },
  /** Gradient wash under the curve — the accent fading out downward. */
  washTop: {
    stopColor: primaryColor.solid1,
    stopOpacity: 0.22,
  },
  washBottom: {
    stopColor: primaryColor.solid1,
    stopOpacity: 0,
  },
  axisLabel: {
    fill: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
});

/**
 * A compact, dependency-free area chart. Deterministic geometry (no animation
 * state) so it renders identically on the server and client.
 *
 * Paint comes from StyleX classes rather than `stroke=` / `fill=` attributes,
 * so the chart follows the editorial theme like everything else — `stroke`,
 * `fill`, and `stop-color` are ordinary CSS properties on SVG elements, and a
 * class beats the attribute. The one attribute left is the `url(#…)` gradient
 * reference, which is a paint server, not a color.
 */
export function AreaChart({
  data,
  h = 150,
  labels,
}: {
  data: Array<number>;
  h?: number;
  labels?: Array<string>;
}) {
  const W = 720;
  const pad = { t: 12, r: 6, b: labels ? 22 : 8, l: 6 };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min;
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const pts = data.map((v, i) => {
    const x =
      pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    // A series that never moves has no span to scale against; it rides the
    // middle rather than being pinned to the floor as if it were the minimum.
    const y =
      span === 0 ? pad.t + ih / 2 : pad.t + ih - ((v - min) / span) * ih;
    return [x, y] as const;
  });
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const last = pts.at(-1);
  const first = pts.at(0);
  if (!last || !first) return null;
  const area = `${line} L${last[0].toFixed(1)} ${pad.t + ih} L${first[0].toFixed(1)} ${pad.t + ih} Z`;
  const gid = `ac${Math.round(min + max + data.length)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      {...stylex.props(styles.svg)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" {...stylex.props(styles.washTop)} />
          <stop offset="100%" {...stylex.props(styles.washBottom)} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={pad.l}
          x2={W - pad.r}
          y1={pad.t + ih * g}
          y2={pad.t + ih * g}
          strokeWidth="1"
          {...stylex.props(styles.guide)}
        />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        {...stylex.props(styles.line)}
      />
      <circle cx={last[0]} cy={last[1]} r="4" {...stylex.props(styles.marker)} />
      {labels?.map((l, i) => (
        <text
          key={i}
          x={pts[i][0]}
          y={h - 6}
          textAnchor="middle"
          {...stylex.props(styles.axisLabel)}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}
