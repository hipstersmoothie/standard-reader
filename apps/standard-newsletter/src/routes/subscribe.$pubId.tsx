import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { getPublicationSummary } from "../server/analytics";
import { C } from "../theme";

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
          borderRadius: 16,
          padding: "40px 36px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
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

        {status === "done" ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: C.t12,
              background: C.sel5,
              borderRadius: 12,
              padding: "18px 20px",
            }}
          >
            <strong>Almost there.</strong> We sent a confirmation link to{" "}
            <span style={{ fontFamily: C.mono }}>{email}</span>. Click it to
            start receiving {summary.name} by email.
          </div>
        ) : (
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
                borderRadius: 10,
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
                borderRadius: 10,
                padding: "12px 16px",
                cursor: status === "submitting" ? "default" : "pointer",
                opacity: status === "submitting" ? 0.7 : 1,
              }}
            >
              {status === "submitting" ? "Subscribing…" : "Subscribe"}
            </button>
            {status === "error" ? (
              <p style={{ fontSize: 13, color: "#a33a2a", marginTop: 12 }}>
                Something went wrong. Please check the address and try again.
              </p>
            ) : null}
            <p style={{ fontSize: 12, color: C.mut, marginTop: 16 }}>
              Double opt-in — you’ll confirm from your inbox. Unsubscribe
              anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
