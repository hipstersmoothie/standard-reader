import { Button } from "@standard-reader/design-system/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { I, Ico } from "../components/icons";
import { PubGlyph } from "../components/ui";
import { publicationsQueryOptions } from "../server/analytics";
import { C, POS, fmt, sectLabel } from "../theme";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(publicationsQueryOptions()),
  component: Home,
});

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: C.sel5,
            color: C.a11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Ico d={icon} s={18} />
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.mut }}>
          0{n}
        </span>
      </div>
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 21,
          fontWeight: 500,
          color: C.t12,
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, color: C.a11, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function wrap(children: ReactNode) {
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 40px" }}>
      {children}
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const goDashboard = () => navigate({ to: "/dashboard" });
  const [calcEmails, setCalcEmails] = useState(50_000);
  const price = Math.max(0, Math.ceil((calcEmails - 1000) / 1000));

  return (
    <div
      style={{
        height: "100vh",
        overflow: "auto",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: `color-mix(in srgb, ${C.pageBg} 88%, transparent)`,
          backdropFilter: "saturate(1.1) blur(10px)",
          borderBottom: `1px solid ${C.b6}`,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "16px 40px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: C.serif,
              fontSize: "1.3rem",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: C.t12,
            }}
          >
            Standard <span style={{ color: C.a9 }}>Newsletter</span>
          </div>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Button variant="tertiary" size="sm" onPress={goDashboard}>
              Log in
            </Button>
            <Button variant="primary" size="sm" onPress={goDashboard}>
              Get started
            </Button>
          </span>
        </div>
      </div>

      {/* HERO */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderBottom: `1px solid ${C.b6}`,
          background: `radial-gradient(120% 100% at 80% -10%, ${C.sel5} 0%, transparent 55%)`,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "84px 40px 74px",
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: C.serif,
                fontWeight: 500,
                fontSize: 56,
                lineHeight: 1.03,
                letterSpacing: "-0.03em",
                margin: "0 0 22px",
                color: C.t12,
                textWrap: "balance",
              }}
            >
              Every post you publish, delivered to inboxes.
            </h1>
            <p
              style={{
                fontSize: 17.5,
                lineHeight: 1.6,
                color: C.a11,
                margin: "0 0 32px",
                maxWidth: 480,
              }}
            >
              Turn any standard.site publication into a newsletter. We mail each
              post you publish to your subscribers and hand you the readership
              analytics — you never write a second version.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button variant="primary" size="lg" onPress={goDashboard}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  Open dashboard
                  <Ico d={I.chevR} s={17} w={2} />
                </span>
              </Button>
              <Button
                variant="tertiary"
                size="lg"
                onPress={() =>
                  navigate({ to: "/p/$pubId", params: { pubId: pubs[0].id } })
                }
              >
                See a publication
              </Button>
            </div>
          </div>

          {/* pizzazz: publications -> envelope */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pubs.slice(0, 3).map((p, i) => (
                <div
                  key={p.id}
                  className="sn-rise"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    background: C.warm,
                    border: `1px solid ${C.b6}`,
                    borderRadius: 12,
                    padding: "10px 14px 10px 10px",
                    boxShadow: `0 10px 30px -20px color-mix(in srgb, ${C.ink} 50%, transparent)`,
                    animationDelay: `${i * 0.09}s`,
                  }}
                >
                  <PubGlyph pub={p} size={30} r={8} fs={15} />
                  <div
                    style={{
                      fontFamily: C.serif,
                      fontSize: 14,
                      color: C.t12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ color: C.a9, padding: "0 4px" }}>
              <Ico d={I.chevR} s={26} w={2} />
            </div>
            <div
              className="sn-float"
              style={{
                width: 108,
                height: 108,
                borderRadius: 22,
                background: C.a9,
                color: C.onAccent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 22px 44px -18px color-mix(in srgb, ${C.a9} 75%, transparent)`,
              }}
            >
              <Ico d={I.mail} s={52} w={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* ANY PUBLICATION */}
      <div style={{ background: C.warm, borderBottom: `1px solid ${C.b6}` }}>
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "68px 40px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div>
            <div style={sectLabel}>
              Works with any standard.site publication
            </div>
            <div
              style={{
                fontFamily: C.serif,
                fontSize: 32,
                fontWeight: 500,
                color: C.t12,
                letterSpacing: "-0.02em",
                lineHeight: 1.14,
                marginBottom: 16,
              }}
            >
              It doesn’t matter where your publication lives.
            </div>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.66,
                color: C.a11,
                margin: 0,
              }}
            >
              Whether you write on one of the hosted platforms or publish
              everything yourself, your posts stay yours and stay portable. If
              it’s a standard.site publication, it can become a newsletter — no
              migration, no export, no lock-in.
            </p>
          </div>
          <div>
            {[
              {
                icon: I.grid,
                t: "On a hosted platform",
                s: "Publishing through Standard Writer or any client.",
              },
              {
                icon: I.book,
                t: "Self-hosted",
                s: "Publishing on your own, wherever it lives.",
              },
            ].map((r) => (
              <div
                key={r.t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "18px 0",
                  borderTop: `1px solid ${C.b6}`,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: C.sel5,
                    color: C.a11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <Ico d={r.icon} s={19} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.t12 }}>
                    {r.t}
                  </div>
                  <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>
                    {r.s}
                  </div>
                </div>
                <Ico d={I.check} s={19} style={{ color: POS, flex: "none" }} />
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                paddingTop: 18,
                borderTop: `1px solid ${C.b6}`,
                fontSize: 14,
                color: C.a11,
              }}
            >
              <span>Your posts</span>
              <Ico d={I.chevR} s={16} style={{ color: C.a9 }} />
              <span>your subscribers</span>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      {wrap(
        <div style={{ padding: "56px 0 8px" }}>
          <div style={{ ...sectLabel, marginBottom: 22 }}>How it works</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 32,
            }}
          >
            <Step
              n={1}
              icon={I.book}
              title="Connect a publication"
              body="Point us at any standard.site publication you own. We pick up your posts automatically — nothing to re-upload."
            />
            <Step
              n={2}
              icon={I.send}
              title="Posts become sends"
              body="Each new post is mailed to that publication’s subscribers, styled to match. You write once; we handle delivery."
            />
            <Step
              n={3}
              icon={I.eye}
              title="Watch it land"
              body="Opens, clicks, growth, and per-send reports across every publication — all in one dashboard."
            />
          </div>
        </div>,
      )}

      {/* PRICING */}
      {wrap(
        <div style={{ padding: "76px 0 96px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 32,
            }}
          >
            <div style={sectLabel}>Pricing</div>
            <span style={{ marginLeft: "auto", fontSize: 13, color: C.mut }}>
              Pay for what you send · every publication included
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 72,
              alignItems: "center",
              borderTop: `1px solid ${C.b6}`,
              paddingTop: 44,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: C.serif,
                    fontSize: 72,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: C.t12,
                  }}
                >
                  $1
                </span>
                <span style={{ fontSize: 16, color: C.mut }}>
                  / 1,000 emails sent
                </span>
              </div>
              <p
                style={{
                  fontSize: 15.5,
                  lineHeight: 1.66,
                  color: C.a11,
                  margin: "18px 0 22px",
                  maxWidth: 400,
                }}
              >
                You’re only billed for emails that actually go out. Send to one
                publication or ten — the rate is the same, and it stays linear
                at any volume.
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  background: C.sel5,
                  color: C.a11,
                  borderRadius: 20,
                  padding: "7px 15px",
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                <Ico d={I.check} s={16} w={2.2} />
                First 1,000 emails free every month
              </div>
              <div style={{ fontSize: 13, color: C.mut, marginTop: 18 }}>
                e.g. a weekly send to 10,000 readers ≈ 43,000 emails/mo ≈ $42.
              </div>
            </div>
            <div
              style={{
                paddingLeft: 72,
                borderLeft: `1px solid ${C.b6}`,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    color: C.mut,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Estimate your bill
                </span>
                <span style={{ fontSize: 14, color: C.t12, fontWeight: 600 }}>
                  {fmt(calcEmails)} emails / mo
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={500_000}
                step={1000}
                value={calcEmails}
                onChange={(e) => setCalcEmails(+e.target.value)}
                style={{ width: "100%", accentColor: C.a9, cursor: "pointer" }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11.5,
                  color: C.mut,
                  marginTop: -6,
                }}
              >
                <span>0</span>
                <span>250k</span>
                <span>500k</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: C.serif,
                    fontSize: 48,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: C.t12,
                  }}
                >
                  ${price}
                </span>
                <span style={{ fontSize: 15, color: C.mut }}>/ month</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Button variant="primary" size="md" onPress={goDashboard}>
                  Get started
                </Button>
              </div>
            </div>
          </div>
        </div>,
      )}
    </div>
  );
}
