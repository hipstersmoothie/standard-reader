import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { getPublicationSummary } from "../server/analytics";
import { C, NEG, R } from "../theme";

export const Route = createFileRoute("/subscribe/$pubId")({
  loader: async ({ params }) => {
    const summary = await getPublicationSummary({
      data: { pubId: params.pubId },
    });
    if (!summary) throw redirect({ to: "/" });
    return summary;
  },
  component: Subscribe,
});

type Status = "idle" | "submitting" | "done" | "error";

function Subscribe() {
  const summary = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [showBluesky, setShowBluesky] = useState(false);
  const [handle, setHandle] = useState("");
  // Set when the Bluesky OAuth round-trip returns here.
  const [welcomed] = useState(() =>
    globalThis.location
      ? new URLSearchParams(globalThis.location.search).has("welcome")
      : false,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationUri: summary.uri, email }),
      });
      const json = (await res.json()) as { ok?: boolean };
      setStatus(json.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  // Subscribe with Bluesky: hand off to the OAuth authorize route, carrying the
  // email + publication so the callback writes the subscriber's own record.
  const onBluesky = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      handle: handle.trim(),
      email: email.trim(),
      subscribe: summary.uri,
      redirect: `/subscribe/${summary.id}?welcome=1`,
    });
    globalThis.location.href = `/api/auth/atproto/authorize?${params.toString()}`;
  };

  const accent = summary.theme.accent;
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: C.warm,
          border: `1px solid ${C.b6}`,
          borderRadius: R.lg,
          padding: "40px 36px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: R.lg,
            background: accent,
            color: summary.theme.accentForeground,
            fontFamily: C.serif,
            fontSize: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          {summary.name.trim()[0]?.toUpperCase() ?? "•"}
        </div>
        <h1
          style={{
            fontFamily: C.serif,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
          }}
        >
          {summary.name}
        </h1>
        {summary.description ? (
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: C.mut,
              margin: "0 0 24px",
            }}
          >
            {summary.description}
          </p>
        ) : (
          <div style={{ height: 12 }} />
        )}

        {welcomed ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: C.t12,
              background: C.sel5,
              borderRadius: R.lg,
              padding: "18px 20px",
            }}
          >
            <strong>You’re subscribed.</strong> Your subscription is saved as a
            record in your own repo — new posts from {summary.name} will arrive
            by email. Unsubscribe anytime by deleting the record or using the
            link in any email.
            <div style={{ marginTop: 12, fontSize: 13.5 }}>
              <a href="/subscribe/manage" style={{ color: C.a9 }}>
                Manage your subscriptions
              </a>
            </div>
          </div>
        ) : status === "done" ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: C.t12,
              background: C.sel5,
              borderRadius: R.lg,
              padding: "18px 20px",
            }}
          >
            <strong>Almost there.</strong> We sent a confirmation link to{" "}
            <span style={{ fontFamily: C.mono }}>{email}</span>. Click it to
            start receiving {summary.name} by email.
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: C.sans,
                  fontSize: 15,
                  padding: "12px 14px",
                  borderRadius: R.md,
                  border: `1px solid ${C.b7}`,
                  background: C.pageBg,
                  color: C.t12,
                  marginBottom: 12,
                }}
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                style={{
                  width: "100%",
                  fontFamily: C.sans,
                  fontSize: 15,
                  fontWeight: 600,
                  color: summary.theme.accentForeground,
                  background: accent,
                  border: "none",
                  borderRadius: R.md,
                  padding: "12px 16px",
                  cursor: status === "submitting" ? "default" : "pointer",
                  opacity: status === "submitting" ? 0.7 : 1,
                }}
              >
                {status === "submitting" ? "Subscribing…" : "Subscribe"}
              </button>
              {status === "error" ? (
                <p style={{ fontSize: 13, color: NEG, marginTop: 12 }}>
                  Something went wrong. Please check the address and try again.
                </p>
              ) : null}
              <p style={{ fontSize: 12, color: C.mut, marginTop: 16 }}>
                Double opt-in — you’ll confirm from your inbox. Unsubscribe
                anytime.
              </p>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "20px 0",
                color: C.mut,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: C.b6 }} />
              or
              <span style={{ flex: 1, height: 1, background: C.b6 }} />
            </div>

            {showBluesky ? (
              <form onSubmit={onBluesky}>
                <input
                  type="text"
                  required
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="your-handle.bsky.social"
                  autoComplete="username"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: C.mono,
                    fontSize: 14,
                    padding: "12px 14px",
                    borderRadius: R.md,
                    border: `1px solid ${C.b7}`,
                    background: C.pageBg,
                    color: C.t12,
                    marginBottom: 12,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    fontFamily: C.sans,
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.t12,
                    background: C.warm,
                    border: `1px solid ${C.b7}`,
                    borderRadius: R.md,
                    padding: "12px 16px",
                    cursor: "pointer",
                  }}
                >
                  Continue with Bluesky
                </button>
                <p style={{ fontSize: 12, color: C.mut, marginTop: 12 }}>
                  We’ll save your subscription as a record in your own repo. Add
                  your email above first, then unsubscribe anytime by deleting
                  the record — or with the link in any email.
                </p>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowBluesky(true)}
                style={{
                  width: "100%",
                  fontFamily: C.sans,
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.t12,
                  background: "transparent",
                  border: `1px solid ${C.b7}`,
                  borderRadius: R.md,
                  padding: "12px 16px",
                  cursor: "pointer",
                }}
              >
                Subscribe with Bluesky
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
