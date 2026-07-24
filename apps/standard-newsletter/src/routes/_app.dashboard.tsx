import { Button } from "@standard-reader/design-system/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { AreaChart } from "../components/charts";
import { I, Ico } from "../components/icons";
import { Delta, PubGlyph } from "../components/ui";
import { MONTHS } from "../data/publications";
import { publicationsQueryOptions } from "../server/analytics";
import { C, R, fmt, sectLabel } from "../theme";

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
              borderRadius: R.lg,
              background: C.warm,
              padding: "56px 40px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: R.lg,
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
              No newsletters yet
            </div>
            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.6,
                color: C.mut,
                maxWidth: 420,
                margin: "0 auto 22px",
              }}
            >
              To get started choose one of your publications to start a
              newsletter for.
            </p>
            <Button
              variant="primary"
              size="lg"
              onPress={() => navigate({ to: "/connect" })}
            >
              Start a newsletter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const totalSubs = pubs.reduce((s, p) => s + p.subs, 0);
  const totalDelta = pubs.reduce((s, p) => s + p.delta, 0);
  const allSends = pubs
    .flatMap((p) => p.sends.map((s) => ({ ...s, pub: p })))
    .toSorted((a, b) => b.sentAtMs - a.sentAtMs);
  const recentSends = allSends.slice(0, 5);
  // Real send counts and totals — a publication with no sends contributes 0,
  // and averages over zero sends are 0, not fabricated.
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const sends30 = allSends.filter((s) => s.sentAtMs >= thirtyDaysAgo).length;
  const emailsSent = allSends.reduce((s, x) => s + x.recipients, 0);
  const sentPubs = pubs.filter((p) => p.sends.length > 0);
  const weight = sentPubs.reduce((s, p) => s + p.subs, 0);
  const avgOpen =
    weight > 0
      ? sentPubs.reduce((s, p) => s + p.openRate * p.subs, 0) / weight
      : 0;
  const avgClick =
    weight > 0
      ? sentPubs.reduce((s, p) => s + p.clickRate * p.subs, 0) / weight
      : 0;
  // No historical subscriber timeseries in the read model, so there's no
  // growth chart to draw (rather than a fabricated curve).
  const hasGrowth = pubs.some((p) => p.growth.length > 0);

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
      foot:
        totalDelta > 0 ? (
          <>
            <Delta value={totalDelta} />
            <span>new this week</span>
          </>
        ) : (
          <span>
            across{" "}
            {pubs.length === 1 ? "1 newsletter" : `${pubs.length} newsletters`}
          </span>
        ),
    },
    {
      icon: I.send,
      label: "Emails sent",
      value: fmt(emailsSent),
      foot: <span>{sends30} sent · 30d</span>,
    },
    {
      icon: I.eye,
      label: "Avg open rate",
      value: emailsSent > 0 ? `${avgOpen.toFixed(1)}%` : "—",
      foot: <span>across sends</span>,
    },
    {
      icon: I.cursor,
      label: "Avg click rate",
      value: emailsSent > 0 ? `${avgClick.toFixed(1)}%` : "—",
      foot: <span>across sends</span>,
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

        {hasGrowth ? (
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
            <AreaChart
              data={MONTHS.map((_, i) =>
                pubs.reduce((s, p) => s + (p.growth[i] ?? 0), 0),
              )}
              h={180}
              labels={MONTHS}
            />
          </div>
        ) : null}

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
              {recentSends.length === 0 ? (
                <div
                  style={{
                    borderTop: `1px solid ${C.b6}`,
                    padding: "18px 6px",
                    fontSize: 13,
                    color: C.mut,
                    fontFamily: C.serif,
                    fontStyle: "italic",
                  }}
                >
                  Nothing sent yet.
                </div>
              ) : null}
              {recentSends.map((s) => (
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
                  <PubGlyph pub={s.pub} size="sm" />
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
