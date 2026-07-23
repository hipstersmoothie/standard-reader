import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { useState } from "react";

import type { MySubscription } from "../server/subscriptions.server";
import { C } from "../theme";

const getMySubscriptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; subs: Array<MySubscription> }> => {
    const { getCurrentUserDid } =
      await import("../integrations/auth/session.server");
    const did = await getCurrentUserDid(getRequest());
    if (!did) return { signedIn: false, subs: [] };
    const { loadMySubscriptions } =
      await import("../server/subscriptions.server");
    return { signedIn: true, subs: await loadMySubscriptions(did) };
  },
);

export const Route = createFileRoute("/subscribe/manage")({
  loader: () => getMySubscriptions(),
  component: Manage,
});

function Manage() {
  const initial = Route.useLoaderData() as {
    signedIn: boolean;
    subs: Array<MySubscription>;
  };
  const [subs, setSubs] = useState<Array<MySubscription>>(initial.subs);
  const [busy, setBusy] = useState<string | null>(null);

  const unsubscribe = async (publicationUri: string) => {
    setBusy(publicationUri);
    try {
      const res = await fetch("/api/subscription/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationUri }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (json.ok) {
        setSubs((prev) =>
          prev.filter((s) => s.publicationUri !== publicationUri),
        );
      }
    } finally {
      setBusy(null);
    }
  };

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
          maxWidth: 520,
          background: C.warm,
          border: `1px solid ${C.b6}`,
          borderRadius: 16,
          padding: "36px 32px",
        }}
      >
        <h1
          style={{
            fontFamily: C.serif,
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
          }}
        >
          Your subscriptions
        </h1>
        <p style={{ fontSize: 13.5, color: C.mut, margin: "0 0 22px" }}>
          Subscriptions you made with Bluesky are records in your own repo.
          Unsubscribing deletes the record.
        </p>

        {initial.signedIn ? null : (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: C.a11 }}>
            <a href="/login" style={{ color: C.a9 }}>
              Sign in with Bluesky
            </a>{" "}
            to manage your subscriptions.
          </p>
        )}
        {initial.signedIn && subs.length === 0 ? (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: C.mut }}>
            You have no Bluesky subscriptions. Ones you made with just an email
            are managed from the unsubscribe link in any email.
          </p>
        ) : null}
        {initial.signedIn && subs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {subs.map((sub) => (
              <div
                key={sub.publicationUri}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  border: `1px solid ${C.b6}`,
                  borderRadius: 12,
                  background: C.pageBg,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: C.serif,
                    fontSize: 16,
                    color: C.t12,
                  }}
                >
                  {sub.publicationName}
                </span>
                <button
                  type="button"
                  disabled={busy === sub.publicationUri}
                  onClick={() => unsubscribe(sub.publicationUri)}
                  style={{
                    flex: "none",
                    fontFamily: C.sans,
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.t12,
                    background: "transparent",
                    border: `1px solid ${C.b7}`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    cursor: busy === sub.publicationUri ? "default" : "pointer",
                    opacity: busy === sub.publicationUri ? 0.6 : 1,
                  }}
                >
                  {busy === sub.publicationUri ? "Removing…" : "Unsubscribe"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
