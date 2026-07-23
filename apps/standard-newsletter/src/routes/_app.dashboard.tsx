import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { AreaChart } from "../components/charts";
import { I, Ico } from "../components/icons";
import { Delta, PubGlyph } from "../components/ui";
import { MONTHS } from "../data/publications";
import { publicationsQueryOptions } from "../server/analytics";
import { C, fmt, sectLabel } from "../theme";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const [hover, setHover] = useState(-1);
  const openPub = (id: string) =>
    navigate({ to: "/p/$pubId", params: { pubId: id } });

  if (pubs.length === 0) {
    return (
      <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "44px 40px 90px",
          }}
        >
          <h1
            style={{
              fontFamily: C.serif,
              fontWeight: 500,
              fontSize: 34,
              letterSpacing: "-0.02em",
              margin: "0 0 30px",
              color: C.t12,
            }}
          >
            Dashboard
          </h1>
          <div
            style={{
              border: `1px solid ${C.b6}`,
              borderRadius: 16,
              background: C.warm,
              padding: "56px 40px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: C.sel5,
                color: C.a11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <Ico d={I.mail} s={24} />
            </div>
            <div
              style={{
                fontFamily: C.serif,
                fontSize: 22,
                fontWeight: 500,
                color: C.t12,
                marginBottom: 8,
              }}
            >
              No publications yet
            </div>
            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.6,
                color: C.mut,
                maxWidth: 420,
                margin: "0 auto",
              }}
            >
              When you own a standard.site publication, it shows up here with
              its subscriber growth and per-send delivery analytics. Publish a
              post and connect your publication to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalSubs = pubs.reduce((s, p) => s + p.subs, 0);
  const totalDelta = pubs.reduce((s, p) => s + p.delta, 0);
  const sends30 = pubs.reduce(
    (s, p) => s + p.sends.filter((x) => /Jul|Jun 2[0-9]/.test(x.when)).length,
    0,
  );
  const emailsSent = pubs.reduce((s, p) => s + p.sends[0].recipients, 0);
  const avgOpen = pubs.reduce((s, p) => s + p.openRate * p.subs, 0) / totalSubs;
  const avgClick =
    pubs.reduce((s, p) => s + p.clickRate * p.subs, 0) / totalSubs;
  const agg = MONTHS.map((_, i) => pubs.reduce((s, p) => s + p.growth[i], 0));
  const allSends = pubs
    .flatMap((p) => p.sends.map((s) => ({ ...s, pub: p })))
    .toSorted((a, b) => Date.parse(b.when) - Date.parse(a.when))
    .slice(0, 5);

  const kpis: Array<{
    icon: string;
    label: string;
    value: string;
    foot: ReactNode;
  }> = [
    {
      icon: I.users,
      label: "Subscribers",
      value: fmt(totalSubs),
      foot: (
        <>
          <Delta value={totalDelta} />
          <span>new in 30d</span>
        </>
      ),
    },
    {
      icon: I.send,
      label: "Emails sent",
      value: fmt(emailsSent),
      foot: <span>{sends30} campaigns · 30d</span>,
    },
    {
      icon: I.eye,
      label: "Avg open rate",
      value: `${avgOpen.toFixed(1)}%`,
      foot: (
        <>
          <Delta value={1.4} suffix="pt" />
          <span>vs. prior</span>
        </>
      ),
    },
    {
      icon: I.cursor,
      label: "Avg click rate",
      value: `${avgClick.toFixed(1)}%`,
      foot: (
        <>
          <Delta value={0.6} suffix="pt" />
          <span>vs. prior</span>
        </>
      ),
    },
  ];

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 1000, margin: "0 auto", padding: "44px 40px 90px" }}
      >
        <h1
          style={{
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
            color: C.t12,
          }}
        >
          Dashboard
        </h1>
        <p
          style={{
            margin: "0 0 30px",
            color: C.mut,
            fontSize: 14.5,
            maxWidth: 620,
          }}
        >
          Delivery and readership across all of your publications. Each
          newsletter is a published post, mailed to that publication’s
          subscribers.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            borderTop: `1px solid ${C.b6}`,
            borderBottom: `1px solid ${C.b6}`,
            marginBottom: 44,
          }}
        >
          {kpis.map((k, i) => (
            <div
              key={k.label}
              style={{
                padding: "22px 24px",
                borderLeft: i === 0 ? "none" : `1px solid ${C.b6}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: C.mut,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 12,
                }}
              >
                <Ico d={k.icon} s={15} style={{ color: C.a11 }} />
                {k.label}
              </div>
              <div
                style={{
                  fontFamily: C.serif,
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  color: C.t12,
                  marginBottom: 9,
                }}
              >
                {k.value}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12.5,
                  color: C.mut,
                }}
              >
                {k.foot}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.t12 }}>
              Total subscribers
            </div>
            <div style={{ fontSize: 12.5, color: C.mut, marginLeft: "auto" }}>
              Last 12 months
            </div>
          </div>
          <AreaChart data={agg} h={180} labels={MONTHS} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 56,
            alignItems: "start",
          }}
        >
          <div>
            <div style={sectLabel}>Publications</div>
            <div style={{ borderBottom: `1px solid ${C.b6}` }}>
              {pubs.map((p, i) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPub(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openPub(p.id);
                  }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(-1)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 10px",
                    borderTop: `1px solid ${C.b6}`,
                    cursor: "pointer",
                    background: hover === i ? C.hover4 : "transparent",
                    transition: "background .12s",
                  }}
                >
                  <PubGlyph pub={p} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: C.serif,
                        fontSize: 17,
                        fontWeight: 500,
                        color: C.t12,
                        letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: C.mut,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 2,
                      }}
                    >
                      <span>{fmt(p.subs)} subscribers</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <Delta value={p.delta} />
                    </div>
                  </div>
                  <div style={{ flex: "none", width: 92, textAlign: "right" }}>
                    <div
                      style={{ fontSize: 15, fontWeight: 600, color: C.t12 }}
                    >
                      {p.openRate}%
                    </div>
                    <div style={{ fontSize: 11.5, color: C.mut }}>
                      open rate
                    </div>
                  </div>
                  <Ico
                    d={I.chevR}
                    s={17}
                    style={{ color: C.mut, flex: "none" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={sectLabel}>Recent sends</div>
            <div style={{ borderBottom: `1px solid ${C.b6}` }}>
              {allSends.map((s) => (
                <div
                  key={`${s.pub.id}-${s.path}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPub(s.pub.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openPub(s.pub.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 6px",
                    cursor: "pointer",
                    borderTop: `1px solid ${C.b6}`,
                  }}
                >
                  <PubGlyph pub={s.pub} size={26} r={7} fs={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: C.t12,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.mut }}>
                      {s.when.split(" · ")[0]} · {s.openRate}% open
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
