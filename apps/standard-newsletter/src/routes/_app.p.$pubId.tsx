import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AreaChart } from "../components/charts";
import { I, Ico } from "../components/icons";
import { Delta, PubGlyph, StatBar, StatCard } from "../components/ui";
import type { Send } from "../data/publications";
import { MONTHS } from "../data/publications";
import { publicationsQueryOptions } from "../server/analytics";
import { C, POSD, R, cardBox, fmt, sectLabel } from "../theme";

export const Route = createFileRoute("/_app/p/$pubId")({
  loader: async ({ context, params }) => {
    const pubs = await context.queryClient.ensureQueryData(
      publicationsQueryOptions(),
    );
    if (!pubs.some((p) => p.id === params.pubId)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PubAnalytics,
});

function SendRow({
  s,
  onOpen,
  last,
}: {
  s: Send;
  onOpen: () => void;
  last: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 120px 84px 22px",
        gap: 16,
        alignItems: "center",
        padding: "16px 18px",
        borderBottom: last ? "none" : `1px solid ${C.b6}`,
        cursor: "pointer",
        background: hover ? C.hover4 : "transparent",
        transition: "background .12s",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: C.serif,
            fontSize: 18,
            fontWeight: 500,
            color: C.t12,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {s.title}
        </div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
          {s.when} · {fmt(s.recipients)} recipients
        </div>
      </div>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12.5,
            marginBottom: 5,
          }}
        >
          <span style={{ color: C.mut }}>Opens</span>
          <span style={{ color: C.t12, fontWeight: 600 }}>{s.openRate}%</span>
        </div>
        <StatBar pct={s.openRate} color={C.a9} />
      </div>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12.5,
            marginBottom: 5,
          }}
        >
          <span style={{ color: C.mut }}>Clicks</span>
          <span style={{ color: C.t12, fontWeight: 600 }}>{s.clickRate}%</span>
        </div>
        <StatBar pct={s.clickRate * 3.5} color={POSD} />
      </div>
      <div style={{ textAlign: "right", fontSize: 12.5, color: C.mut }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Ico d={I.userMinus} s={13} />
          {s.unsubs}
        </span>
      </div>
      <Ico d={I.chevR} s={16} style={{ color: C.mut }} />
    </div>
  );
}

function PubAnalytics() {
  const { pubId } = Route.useParams();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const navigate = useNavigate();
  const pub = pubs.find((p) => p.id === pubId);
  if (!pub) return null;
  const t = pub.theme;
  // A publication with no published posts has no sends; averaging over zero of
  // them is NaN, not an error state.
  const avgUnsub =
    pub.sends.length > 0
      ? Math.round(
          pub.sends.reduce((s, x) => s + x.unsubs, 0) / pub.sends.length,
        )
      : 0;

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{
          background: t.background,
          color: t.foreground,
          borderBottom: `1px solid ${C.b6}`,
        }}
      >
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "36px 40px 30px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <PubGlyph pub={pub} size={60} r={R.lg} fs={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: C.serif,
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {pub.name}
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                opacity: 0.82,
                marginTop: 7,
                maxWidth: 520,
              }}
            >
              {pub.desc}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 13,
                fontSize: 12.5,
                opacity: 0.75,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: C.mono,
                }}
              >
                <Ico d={I.link} s={14} />
                {pub.url}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Ico d={I.calendar} s={14} />
                {pub.cadence}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{pub.sends.length} sends</span>
            </div>
          </div>
          <a
            href={`https://${pub.url}`}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: t.foreground,
              opacity: 0.75,
              textDecoration: "none",
            }}
          >
            <Ico d={I.external} s={15} /> Visit site
          </a>
        </div>
      </div>

      <div
        style={{ maxWidth: 1000, margin: "0 auto", padding: "26px 40px 90px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <StatCard
            icon={I.users}
            label="Subscribers"
            value={fmt(pub.subs)}
            foot={
              <span>
                <Delta value={pub.delta} /> new in 30d
              </span>
            }
          />
          <StatCard
            icon={I.eye}
            label="Open rate"
            value={`${pub.openRate}%`}
            foot="avg across sends"
          />
          <StatCard
            icon={I.cursor}
            label="Click rate"
            value={`${pub.clickRate}%`}
            foot="avg across sends"
          />
          <StatCard
            icon={I.userMinus}
            label="Unsubscribes"
            value={`${avgUnsub}`}
            foot="avg per send"
          />
        </div>

        <div style={{ ...cardBox, padding: 22, marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}>
              Subscriber growth
            </div>
            <div style={{ fontSize: 12.5, color: C.mut, marginLeft: "auto" }}>
              Last 12 months
            </div>
          </div>
          <AreaChart data={pub.growth} h={160} labels={MONTHS} />
        </div>

        <div
          style={{ display: "flex", alignItems: "flex-end", marginBottom: 12 }}
        >
          <div style={sectLabel}>Newsletters sent</div>
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: C.mut }}>
            Each row is a published post mailed to subscribers
          </span>
        </div>
        <div style={{ ...cardBox, overflow: "hidden" }}>
          {pub.sends.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div
                style={{
                  fontFamily: C.serif,
                  fontSize: 18,
                  color: C.t12,
                  marginBottom: 6,
                }}
              >
                No newsletters sent yet
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: C.mut,
                  maxWidth: 380,
                  margin: "0 auto",
                }}
              >
                New posts published to this publication are mailed to its
                subscribers and their delivery reports appear here.
              </p>
            </div>
          ) : (
            pub.sends.map((s, i) => (
              <SendRow
                key={s.path}
                s={s}
                last={i === pub.sends.length - 1}
                onOpen={() =>
                  navigate({
                    to: "/p/$pubId/$sendPath",
                    params: { pubId: pub.id, sendPath: s.path },
                  })
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
