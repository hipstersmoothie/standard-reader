import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateImage,
  EmptyStateTitle,
} from "@standard-reader/design-system/empty-state";
import { SearchField } from "@standard-reader/design-system/search-field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import { I, Ico } from "../components/icons";
import type { SubscriberRowData } from "../server/analytics";
import {
  publicationSubscribersQueryOptions,
  publicationsQueryOptions,
} from "../server/analytics";
import { C, fmt } from "../theme";

export const Route = createFileRoute("/_app/p/$pubId_/subscribers/")({
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
  const navigate = useNavigate();
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
          <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {all.length > 0 ? (
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
            ) : null}
            <Button
              variant="primary"
              onPress={() =>
                navigate({
                  to: "/p/$pubId/subscribers/import",
                  params: { pubId },
                })
              }
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Ico d={I.upload} s={16} />
                Import
              </span>
            </Button>
          </span>
        </div>

        {all.length === 0 ? (
          <SubscribersEmptyState
            name={data?.name ?? "this publication"}
            onImport={() =>
              navigate({
                to: "/p/$pubId/subscribers/import",
                params: { pubId },
              })
            }
          />
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
              <SegmentedControl
                size="sm"
                selectedKeys={new Set([filter])}
                onSelectionChange={(keys) => {
                  const next = [...(keys as Set<Key>)][0];
                  if (typeof next === "string") setFilter(next as Filter);
                }}
              >
                {tabs.map(([id, label]) => (
                  <SegmentedControlItem key={id} id={id} selection="fill">
                    {label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <span style={{ marginLeft: "auto", width: 260 }}>
                <SearchField
                  size="sm"
                  aria-label="Search subscribers"
                  placeholder="Search email"
                  value={q}
                  onChange={setQ}
                />
              </span>
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
              <Badge size="sm" variant="critical">
                Unsubbed
              </Badge>
            ) : null}
            {s.status === "pending" ? (
              <Badge size="sm" variant="warning">
                Pending
              </Badge>
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

function SubscribersEmptyState({
  name,
  onImport,
}: {
  name: string;
  onImport: () => void;
}) {
  return (
    <EmptyState>
      <EmptyStateImage>
        <Users size={24} />
      </EmptyStateImage>
      <EmptyStateTitle>No subscribers yet</EmptyStateTitle>
      <EmptyStateDescription>
        When someone subscribes to {name} — from the subscribe page or a Bluesky
        record — they’ll appear here. You can also import an existing list.
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button variant="primary" size="sm" onPress={onImport}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <Ico d={I.upload} s={16} />
            Import subscribers
          </span>
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}
