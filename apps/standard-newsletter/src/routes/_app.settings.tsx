import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { settingsQueryOptions } from "../server/analytics";
import { C, POS, sectLabel } from "../theme";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(settingsQueryOptions()),
  component: Settings,
});

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        padding: "14px 4px",
        borderTop: `1px solid ${C.b6}`,
      }}
    >
      <div style={{ width: 140, flex: "none", fontSize: 13, color: C.mut }}>
        {label}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14.5,
          color: C.t12,
          fontFamily: mono ? C.mono : C.sans,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Settings() {
  const { data } = useSuspenseQuery(settingsQueryOptions());
  const v = data.viewer;
  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "44px 40px 90px" }}
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
          Settings
        </h1>
        <p style={{ margin: "0 0 34px", color: C.mut, fontSize: 14.5 }}>
          Your account and how newsletters are sent.
        </p>

        <div style={{ marginBottom: 40 }}>
          <div style={sectLabel}>Account</div>
          <div style={{ borderBottom: `1px solid ${C.b6}` }}>
            <Row label="Name" value={v?.displayName ?? "—"} />
            <Row label="Handle" value={v?.handle ? `@${v.handle}` : "—"} mono />
            <Row label="DID" value={v?.did ?? "—"} mono />
          </div>
        </div>

        <div>
          <div style={sectLabel}>Sending</div>
          <div style={{ borderBottom: `1px solid ${C.b6}` }}>
            <Row label="From name" value={data.sending.fromName} />
            <Row label="From address" value={data.sending.fromAddress} mono />
            <Row
              label="Links / unsubscribe"
              value={data.sending.publicUrl}
              mono
            />
            <Row
              label="Resend"
              value={
                <span
                  style={{
                    color: data.sending.resendConfigured ? POS : C.mut,
                    fontWeight: 600,
                  }}
                >
                  {data.sending.resendConfigured
                    ? "Connected"
                    : "Not configured"}
                </span>
              }
            />
          </div>
          <p
            style={{
              fontSize: 13,
              color: C.mut,
              marginTop: 16,
              lineHeight: 1.6,
            }}
          >
            Sending identity is configured via environment for now (a verified
            Resend sender domain). Per-publication sender settings are coming.
          </p>
        </div>
      </div>
    </div>
  );
}
