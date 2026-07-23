import { C } from "../theme";

/**
 * A compact, dependency-free area chart. Deterministic geometry (no animation
 * state) so it renders identically on the server and client.
 */
export function AreaChart({
  data,
  h = 150,
  stroke = C.a9,
  labels,
}: {
  data: Array<number>;
  h?: number;
  stroke?: string;
  labels?: Array<string>;
}) {
  const W = 720;
  const pad = { t: 12, r: 6, b: labels ? 22 : 8, l: 6 };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const pts = data.map((v, i) => {
    const x =
      pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = pad.t + ih - ((v - min) / span) * ih;
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
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={pad.l}
          x2={W - pad.r}
          y1={pad.t + ih * g}
          y2={pad.t + ih * g}
          stroke={C.b6}
          strokeWidth="1"
        />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="4" fill={stroke} />
      {labels?.map((l, i) => (
        <text
          key={i}
          x={pts[i][0]}
          y={h - 6}
          fill={C.mut}
          fontSize="10.5"
          textAnchor="middle"
          fontFamily={C.sans}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}
