import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { AreaChart } from "../components/charts";
import { I, Ico } from "../components/icons";
import { BigStat, StatBar } from "../components/ui";
import { publicationsQueryOptions } from "../server/analytics";
import { C, NEG, POS, POSD, cardBox, fmt } from "../theme";

export const Route = createFileRoute("/_app/p/$pubId_/$sendPath")({
  loader: async ({ context, params }) => {
    const pubs = await context.queryClient.ensureQueryData(
      publicationsQueryOptions(),
    );
    const pub = pubs.find((p) => p.id === params.pubId);
    const send = pub?.sends.find((s) => s.path === params.sendPath);
    if (!pub || !send) throw redirect({ to: "/dashboard" });
  },
  component: SendDetail,
});

function SendDetail() {
  const { pubId, sendPath } = Route.useParams();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const pub = pubs.find((p) => p.id === pubId);
  const send = pub?.sends.find((s) => s.path === sendPath);
  if (!pub || !send) return null;

  const delivered = send.delivered ?? send.recipients - send.bounces;
  const opens = Math.round((delivered * send.openRate) / 100);
  const clicks = Math.round((delivered * send.clickRate) / 100);
  // Real cumulative-open curve when the send was recorded; else a modeled shape.
  const curve =
    send.opensByHour ??
    Array.from({ length: 13 }, (_, i) => {
      const x = i / 12;
      return Math.round(opens * (1 - Math.exp(-3.2 * x)));
    });
  const hourLabels = ["0h", "", "4h", "", "8h", "", "12h", "", "", "", "", "", "48h"];
  const links =
    send.topLinks && send.topLinks.length > 0
      ? send.topLinks.map((l) => ({ label: l.url, count: l.count }))
      : [
          { label: `${pub.url}/${send.path}`, share: 0.52 },
          { label: `${pub.url}/subscribe`, share: 0.19 },
          { label: "View in the Reader app", share: 0.16 },
          { label: `${pub.url}/archive`, share: 0.13 },
        ].map((l) => ({ label: l.label, count: Math.round(clicks * l.share) }));
  const maxLink = Math.max(1, ...links.map((l) => l.count));

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "30px 40px 90px" }}>
        <Link
          to="/p/$pubId"
          params={{ pubId: pub.id }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.mut,
            textDecoration: "none",
          }}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {pub.name}
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            margin: "14px 0 4px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                color: POS,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: POSD,
                }}
              />
              Delivered · {send.when}
            </div>
            <h1
              style={{
                fontFamily: C.serif,
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.02em",
                margin: 0,
                color: C.t12,
                lineHeight: 1.12,
              }}
            >
              {send.title}
            </h1>
            <div
              style={{
                fontSize: 14,
                color: C.mut,
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ico d={I.mail} s={15} />
              <span style={{ fontStyle: "italic" }}>“{send.subject}”</span>
            </div>
          </div>
          <div style={{ flex: "none", display: "flex", gap: 10 }}>
            <a
              href={`https://${pub.url}/${send.path}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13.5,
                fontWeight: 500,
                color: C.t12,
                background: C.warm,
                border: `1px solid ${C.b7}`,
                borderRadius: 8,
                padding: "7px 13px",
                textDecoration: "none",
              }}
            >
              <Ico d={I.external} s={16} />
              View post
            </a>
          </div>
        </div>

        <div
          style={{
            ...cardBox,
            padding: "20px 26px",
            margin: "24px 0",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 16,
          }}
        >
          <BigStat
            label="Delivered"
            value={fmt(delivered)}
            sub={`${((delivered / send.recipients) * 100).toFixed(1)}% of ${fmt(send.recipients)}`}
          />
          <BigStat
            label="Opens"
            value={`${send.openRate}%`}
            sub={`${fmt(opens)} unique`}
            color={C.a11}
          />
          <BigStat
            label="Clicks"
            value={`${send.clickRate}%`}
            sub={`${fmt(clicks)} unique`}
            color={POS}
          />
          <BigStat
            label="Unsubscribes"
            value={fmt(send.unsubs)}
            sub={`${((send.unsubs / send.recipients) * 100).toFixed(2)}%`}
          />
          <BigStat
            label="Bounced"
            value={fmt(send.bounces)}
            sub={`${((send.bounces / send.recipients) * 100).toFixed(2)}%`}
            color={NEG}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ ...cardBox, padding: 22 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}>
                Opens over time
              </div>
              <div
                style={{ fontSize: 12.5, color: C.mut, marginLeft: "auto" }}
              >
                First 48 hours
              </div>
            </div>
            <AreaChart data={curve} h={168} labels={hourLabels} />
          </div>

          <div style={{ ...cardBox, padding: 22 }}>
            <div
              style={{
                fontFamily: C.serif,
                fontSize: 18,
                color: C.t12,
                marginBottom: 16,
              }}
            >
              Top links clicked
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 15 }}
            >
              {links.map((l) => (
                <div key={l.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        color: C.a11,
                        fontFamily: C.mono,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.label}
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: C.t12,
                        fontWeight: 600,
                        flex: "none",
                      }}
                    >
                      {fmt(l.count)}
                    </span>
                  </div>
                  <StatBar pct={(l.count / maxLink) * 100} color={C.a9} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
