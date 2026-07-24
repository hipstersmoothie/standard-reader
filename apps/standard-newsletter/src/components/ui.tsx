import type { ReactNode } from "react";

import type { Publication } from "../data/publications";
import { C, NEG, POS, R, cardBox } from "../theme";
import { I, Ico } from "./icons";

export function Delta({
  value,
  suffix = "",
  invert = false,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
}) {
  const good = invert ? value < 0 : value >= 0;
  const col = good ? POS : NEG;
  const arrow = value >= 0 ? I.up : I.down;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 12.5,
        color: col,
        fontWeight: 600,
      }}
    >
      <Ico d={arrow} s={13} w={2.4} />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

export function StatBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: R.sm,
        background: C.ui3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, pct)}%`,
          height: "100%",
          background: color,
          borderRadius: R.sm,
        }}
      />
    </div>
  );
}

export function PubGlyph({
  pub,
  size = 40,
  r = R.md,
  fs = 20,
}: {
  pub: Publication;
  size?: number;
  /** Corner radius — a token from `R`, sized to the glyph. */
  r?: string;
  fs?: number;
}) {
  const t = pub.theme;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: t.accent,
        color: t.accentForeground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: C.serif,
        fontSize: fs,
        flex: "none",
      }}
    >
      {pub.icon}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  foot,
}: {
  icon: string;
  label: string;
  value: string;
  foot: ReactNode;
}) {
  return (
    <div
      style={{
        ...cardBox,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: R.md,
            background: C.sel5,
            color: C.a11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Ico d={icon} s={16} />
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: C.mut,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: C.t12,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: C.mut }}>{foot}</div>
    </div>
  );
}

export function BigStat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div
        style={{
          fontSize: 12,
          color: C.mut,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: color ?? C.t12,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.mut, marginTop: 5 }}>{sub}</div>
    </div>
  );
}
