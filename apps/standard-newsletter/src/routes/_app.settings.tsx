import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import {
  publicationsQueryOptions,
  settingsQueryOptions,
} from "../server/analytics";
import { C, NEG, POS, sectLabel } from "../theme";

export const Route = createFileRoute("/_app/settings")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions()),
      context.queryClient.ensureQueryData(publicationsQueryOptions()),
    ]);
  },
  component: Settings,
});

type ImportState = "idle" | "importing" | "done" | "error";

function ImportSubscribers() {
  const { data: allPubs } = useSuspenseQuery(publicationsQueryOptions());
  // Import needs a real publication AT-URI (DB-backed); sample data has none.
  const pubs = allPubs.filter((p): p is typeof p & { uri: string } =>
    Boolean(p.uri),
  );
  const [pubUri, setPubUri] = useState(pubs[0]?.uri ?? "");
  const [text, setText] = useState("");
  const [state, setState] = useState<ImportState>("idle");
  const [count, setCount] = useState(0);

  const onImport = async () => {
    setState("importing");
    try {
      const res = await fetch("/api/subscribers/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationUri: pubUri, emails: text }),
      });
      const json = (await res.json()) as { ok?: boolean; count?: number };
      if (json.ok) {
        setCount(json.count ?? 0);
        setState("done");
        setText("");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: C.sans,
    fontSize: 14,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.b7}`,
    background: C.pageBg,
    color: C.t12,
  };

  if (pubs.length === 0) return null;

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={sectLabel}>Import email subscribers</div>
      <p
        style={{
          fontSize: 13,
          color: C.mut,
          margin: "6px 0 14px",
          lineHeight: 1.6,
        }}
      >
        Paste addresses (commas or new lines). They’re saved to your
        publication’s subscriber-list record — data you own — and start
        receiving new posts.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <select
          value={pubUri}
          onChange={(e) => setPubUri(e.target.value)}
          style={field}
        >
          {pubs.map((p) => (
            <option key={p.id} value={p.uri}>
              {p.name}
            </option>
          ))}
        </select>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"reader@example.com\nanother@example.com"}
          style={{ ...field, fontFamily: C.mono, resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onImport}
            disabled={state === "importing" || !text.trim()}
            style={{
              fontFamily: C.sans,
              fontSize: 14,
              fontWeight: 600,
              color: C.onAccent,
              background: C.a9,
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              cursor:
                state === "importing" || !text.trim() ? "default" : "pointer",
              opacity: state === "importing" || !text.trim() ? 0.6 : 1,
            }}
          >
            {state === "importing" ? "Importing…" : "Import"}
          </button>
          {state === "done" ? (
            <span style={{ fontSize: 13, color: POS }}>
              Imported — {count} active subscriber{count === 1 ? "" : "s"}.
            </span>
          ) : null}
          {state === "error" ? (
            <span style={{ fontSize: 13, color: NEG }}>
              Import failed. Check that HappyView is configured and you own this
              publication.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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

        <ImportSubscribers />

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
