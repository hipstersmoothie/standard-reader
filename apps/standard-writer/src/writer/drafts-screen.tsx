import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { DraftRow } from "#/db/schema/drafts";

import { sessionQueryOptions } from "../integrations/tanstack-query/api-auth.functions";
import { draftsQueryOptions } from "../integrations/tanstack-query/api-drafts.functions";
import { C } from "./tokens";
import type { Screen } from "./types";

function excerptOf(markdown: string): string {
  const text = markdown
    .replaceAll(/[#>*`_[\]()!-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function wordCountOf(markdown: string): string {
  const n = markdown.split(/\s+/).filter(Boolean).length;
  return n.toLocaleString();
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

interface DraftsScreenProps {
  go: (screen: Screen) => void;
}

export function DraftsScreen({ go }: DraftsScreenProps) {
  const { data: session } = useQuery(sessionQueryOptions);
  const { data: drafts = [], isPending } = useQuery(draftsQueryOptions);
  const [hover, setHover] = useState(-1);

  return (
    <div
      className="sw-scroll"
      style={{ height: "100%", overflow: "auto", background: C.pageBg }}
    >
      <div
        style={{ maxWidth: 920, margin: "0 auto", padding: "44px 40px 80px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 16,
            marginBottom: 8,
          }}
        >
          <h1
            style={{
              fontFamily: C.serif,
              fontWeight: 500,
              fontSize: 34,
              letterSpacing: "-0.02em",
              margin: 0,
              color: C.t12,
            }}
          >
            Drafts
          </h1>
          <span style={{ marginLeft: "auto" }}>
            <Button variant="primary" size="sm" onPress={() => go("write")}>
              New document
            </Button>
          </span>
        </div>
        <p
          style={{
            margin: "0 0 28px",
            color: C.mut,
            fontSize: 14.5,
            maxWidth: 560,
          }}
        >
          Private working state, stored in our database and synced to your DID
          across devices — not yet public repo records.
        </p>

        {session ? (
          isPending ? (
            <EmptyState title="Loading…" body="" />
          ) : drafts.length === 0 ? (
            <EmptyState
              title="No drafts yet"
              body="Start a new document — it autosaves here as you write."
            />
          ) : (
            <div style={{ borderTop: `1px solid ${C.b6}` }}>
              {drafts.map((d: DraftRow, i: number) => (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => go("write")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      go("write");
                    }
                  }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(-1)}
                  style={{
                    display: "flex",
                    gap: 20,
                    alignItems: "flex-start",
                    padding: "20px 16px",
                    borderBottom:
                      i === drafts.length - 1 ? "none" : `1px solid ${C.b6}`,
                    cursor: "pointer",
                    background: hover === i ? C.warm : "transparent",
                    transition: "background .12s",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: C.serif,
                          fontSize: 21,
                          fontWeight: 500,
                          color: C.t12,
                          letterSpacing: "-0.01em",
                          lineHeight: 1.2,
                        }}
                      >
                        {d.title || "Untitled"}
                      </span>
                      {i === 0 && (
                        <Badge variant="primary" size="sm">
                          Latest
                        </Badge>
                      )}
                      <span
                        style={{
                          flex: "none",
                          marginLeft: "auto",
                          fontSize: 12.5,
                          color: C.mut,
                        }}
                      >
                        Edited {relativeTime(new Date(d.updatedAt))}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14.5,
                        color: C.a11,
                        lineHeight: 1.55,
                        marginBottom: 12,
                        maxWidth: 620,
                      }}
                    >
                      {excerptOf(d.bodyMarkdown) || "No content yet."}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12.5,
                        color: C.mut,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: "#8a6d3b",
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: "#c99f6a",
                          }}
                        />
                        Draft
                      </span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{wordCountOf(d.bodyMarkdown)} words</span>
                      {d.tags && d.tags.length > 0 && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ fontFamily: C.mono }}>
                            {d.tags.join(" · ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            title="Sign in to see your drafts"
            body="Drafts are kept privately in our database, keyed to your DID. Sign in to start writing."
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${C.b6}`,
        paddingTop: 48,
        textAlign: "center",
        color: C.mut,
      }}
    >
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 20,
          color: C.t12,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {body ? (
        <div style={{ fontSize: 14, maxWidth: 380, margin: "0 auto" }}>
          {body}
        </div>
      ) : null}
    </div>
  );
}
