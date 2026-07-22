import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { auth } from "../integrations/tanstack-query/api-auth.functions";
import { I, Ico } from "../writer/icons";
import { C } from "../writer/tokens";

export const Route = createFileRoute("/")({
  // Signed-in authors skip the marketing page and go straight to the app.
  beforeLoad: async () => {
    const session = await auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const FEATURES: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: I.file,
    title: "The document is the record",
    body: "Write in a calm block editor that serializes losslessly to portable at.markpub.markdown. No CMS holds your drafts hostage.",
  },
  {
    icon: I.up,
    title: "Publishing is a protocol action",
    body: "One click writes a site.standard.document to a repo you own, signed by your DID. No platform to be de-platformed from.",
  },
  {
    icon: I.book,
    title: "Legible across the network",
    body: "Everything you publish is exactly what Standard Reader — and any standard.site-aware tool — renders the moment it lands.",
  },
];

function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 40px",
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: C.serif,
            fontSize: "1.35rem",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: C.t12,
          }}
        >
          Standard <span style={{ color: C.a9 }}>Writer</span>
        </div>
        <Link
          to="/login"
          style={{ fontSize: 14, color: C.a11, textDecoration: "none" }}
        >
          Sign in
        </Link>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
          padding: "0 40px",
        }}
      >
        <section style={{ padding: "72px 0 64px", maxWidth: 720 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: C.a11,
              fontFamily: C.mono,
              border: `1px solid ${C.b6}`,
              borderRadius: 999,
              padding: "5px 12px",
              marginBottom: 26,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: C.a9,
              }}
            />
            Authoring for standard.site on the AT Protocol
          </div>
          <h1
            style={{
              fontFamily: C.serif,
              fontWeight: 500,
              fontSize: 60,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              margin: "0 0 22px",
              color: C.t12,
              textWrap: "balance",
            }}
          >
            You own the press.
          </h1>
          <p
            style={{
              fontFamily: C.serif,
              fontSize: 21,
              lineHeight: 1.6,
              color: C.ink,
              margin: "0 0 36px",
              maxWidth: 620,
            }}
          >
            A calm, editorial writing surface that publishes to a repository you
            control — not a feed on someone else’s server. Compose, keep drafts,
            and publish signed records that any reader on the network can
            render.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link
              to="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: C.a9,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                padding: "12px 22px",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              <Ico d={I.pen} s={17} w={2} />
              Start writing
            </Link>
            <Link
              to="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${C.b7}`,
                color: C.t12,
                fontSize: 15,
                fontWeight: 600,
                padding: "12px 22px",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              Sign in with Bluesky
            </Link>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            padding: "12px 0 80px",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                border: `1px solid ${C.b6}`,
                borderRadius: 16,
                background: C.warm,
                padding: 24,
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
                  marginBottom: 16,
                }}
              >
                <Ico d={f.icon} s={19} />
              </div>
              <div
                style={{
                  fontFamily: C.serif,
                  fontSize: 19,
                  color: C.t12,
                  marginBottom: 8,
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.a11 }}>
                {f.body}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer
        style={{
          borderTop: `1px solid ${C.b6}`,
          padding: "22px 40px",
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          color: C.mut,
        }}
      >
        <span>The writing companion to Standard Reader.</span>
        <span style={{ fontFamily: C.mono }}>site.standard</span>
      </footer>
    </div>
  );
}
