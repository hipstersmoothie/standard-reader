import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { I, Ico } from "../components/icons";
import type { SubscriberRowData } from "../server/analytics";
import {
  publicationSubscribersQueryOptions,
  publicationsQueryOptions,
} from "../server/analytics";
import { C, NEG, R, fmt } from "../theme";

export const Route = createFileRoute("/_app/p/$pubId_/subscribers")({
  loader: async ({ context, params }) => {
    const [pubs, subs] = await Promise.all([
      context.queryClient.ensureQueryData(publicationsQueryOptions()),
      context.queryClient.ensureQueryData(
        publicationSubscribersQueryOptions(params.pubId),
      ),
    ]);
    // No connected publication by that id, or not the owner → nothing to show.
    if (!pubs.some((p) => p.id === params.pubId) || !subs) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Subscribers,
});

type Filter = "all" | "confirmed" | "pending" | "unsubscribed";

const SOURCE_LABEL: Record<string, string> = {
  email: "Email",
  space: "Bluesky",
};

/** local-part of an email, for a friendlier avatar initial and display. */
function emailName(email: string): string {
  return email.split("@")[0] ?? email;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function toCsv(rows: Array<SubscriberRowData>): string {
  const header = ["email", "status", "source", "joined", "open_rate"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.status,
      SOURCE_LABEL[r.source] ?? r.source,
      r.joined,
      r.openRate === null ? "" : String(r.openRate),
    ]
      .map((v) => csvCell(v))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function Subscribers() {
  const { pubId } = Route.useParams();
  const { data } = useSuspenseQuery(publicationSubscribersQueryOptions(pubId));
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const all = useMemo(() => data?.subscribers ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: all.length,
      confirmed: all.filter((s) => s.status === "confirmed").length,
      pending: all.filter((s) => s.status === "pending").length,
      unsubscribed: all.filter((s) => s.status === "unsubscribed").length,
    }),
    [all],
  );

  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (s) =>
      (filter === "all" || s.status === filter) &&
      (needle === "" ||
        s.email.toLowerCase().includes(needle) ||
        (s.did?.toLowerCase().includes(needle) ?? false)),
  );

  const onExport = () => {
    if (globalThis.document === undefined) return;
    const blob = new Blob([toCsv(all)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement("a");
    a.href = url;
    a.download = `${pubId}-subscribers.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Only these four filters exist; pending gets a tab only when there are any,
  // since most publications never have unconfirmed rows lingering.
  const tabs: Array<[Filter, string]> = [
    ["all", `All ${counts.all}`],
    ["confirmed", `Confirmed ${counts.confirmed}`],
    ...(counts.pending > 0
      ? ([["pending", `Pending ${counts.pending}`]] as Array<[Filter, string]>)
      : []),
    ["unsubscribed", `Unsubscribed ${counts.unsubscribed}`],
  ];

  const COLS = "2fr 1fr 96px 120px";

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 40px 90px" }}
      >
        <Link
          to="/p/$pubId"
          params={{ pubId }}
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
          {data?.name}
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 16,
            margin: "14px 0 22px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: C.serif,
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.02em",
                margin: 0,
                color: C.t12,
              }}
            >
              Subscribers
            </h1>
            <div style={{ fontSize: 14, color: C.mut, marginTop: 6 }}>
              {counts.confirmed === 0
                ? `No one receives ${data?.name} yet`
                : `${fmt(counts.confirmed)} ${counts.confirmed === 1 ? "person receives" : "people receive"} ${data?.name}`}
            </div>
          </div>
          {all.length > 0 ? (
            <span style={{ marginLeft: "auto" }}>
              <Button variant="tertiary" size="sm" onPress={onExport}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <Ico d={I.download} s={16} />
                  Export CSV
                </span>
              </Button>
            </span>
          ) : null}
        </div>

        {all.length === 0 ? (
          <EmptyState name={data?.name ?? "this publication"} />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    style={{
                      font: "inherit",
                      cursor: "pointer",
                      border: "none",
                      background: filter === id ? C.sel5 : "transparent",
                      color: filter === id ? C.a11 : C.mut,
                      fontSize: 13,
                      fontWeight: 500,
                      padding: "6px 12px",
                      borderRadius: R.md,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.warm,
                  border: `1px solid ${C.b6}`,
                  borderRadius: R.md,
                  padding: "7px 12px",
                  width: 260,
                }}
              >
                <Ico
                  d={I.search}
                  s={15}
                  style={{ color: C.mut, flex: "none" }}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search email"
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    font: "inherit",
                    fontSize: 13.5,
                    color: C.t12,
                    width: "100%",
                  }}
                />
              </label>
            </div>

            <div style={{ borderBottom: `1px solid ${C.b6}` }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  gap: 16,
                  padding: "10px 12px",
                  borderTop: `1px solid ${C.b6}`,
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: C.mut,
                }}
              >
                <span>Subscriber</span>
                <span>Source</span>
                <span style={{ textAlign: "right" }}>Opens</span>
                <span style={{ textAlign: "right" }}>Joined</span>
              </div>
              {rows.map((s) => (
                <SubscriberRow key={s.email} s={s} cols={COLS} />
              ))}
              {rows.length === 0 ? (
                <div
                  style={{
                    padding: "30px 12px",
                    borderTop: `1px solid ${C.b6}`,
                    fontSize: 13.5,
                    color: C.mut,
                    textAlign: "center",
                  }}
                >
                  No subscribers match “{q}”.
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SubscriberRow({ s, cols }: { s: SubscriberRowData; cols: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols,
        gap: 16,
        alignItems: "center",
        padding: "12px 12px",
        borderTop: `1px solid ${C.b6}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        <Avatar
          size="sm"
          alt=""
          fallback={emailName(s.email).charAt(0).toUpperCase()}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: C.t12,
                fontFamily: C.mono,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.email}
            </span>
            {s.status === "unsubscribed" ? (
              <StatusPill label="Unsubbed" />
            ) : null}
            {s.status === "pending" ? (
              <StatusPill label="Pending" muted />
            ) : null}
          </div>
          {s.did ? (
            <div
              style={{
                fontSize: 12,
                color: C.mut,
                fontFamily: C.mono,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.did}
            </div>
          ) : null}
        </div>
      </div>
      <span style={{ fontSize: 13, color: C.a11 }}>
        {SOURCE_LABEL[s.source] ?? s.source}
      </span>
      <span
        style={{
          textAlign: "right",
          fontSize: 13.5,
          color: s.openRate === null ? C.mut : C.t12,
          fontWeight: 600,
        }}
      >
        {s.openRate === null ? "—" : `${s.openRate}%`}
      </span>
      <span style={{ textAlign: "right", fontSize: 13, color: C.mut }}>
        {s.joined}
      </span>
    </div>
  );
}

function StatusPill({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      style={{
        flex: "none",
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: muted ? C.mut : NEG,
        background: muted
          ? C.ui3
          : `color-mix(in srgb, ${NEG} 12%, transparent)`,
        borderRadius: R.sm,
        padding: "1px 6px",
      }}
    >
      {label}
    </span>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div
      style={{
        border: `1px solid ${C.b6}`,
        borderRadius: R.lg,
        background: C.warm,
        padding: "48px 40px",
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
        <Ico d={I.users} s={24} />
      </div>
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 21,
          fontWeight: 500,
          color: C.t12,
          marginBottom: 8,
        }}
      >
        No subscribers yet
      </div>
      <p
        style={{
          fontSize: 14.5,
          lineHeight: 1.6,
          color: C.mut,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        When someone subscribes to {name} — from the subscribe page or a Bluesky
        record — they’ll appear here. You can also import an existing list from
        Settings.
      </p>
    </div>
  );
}
