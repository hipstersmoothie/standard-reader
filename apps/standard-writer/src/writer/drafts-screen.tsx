import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { useState } from "react";

import { DRAFTS } from "./data";
import { clickable } from "./interaction";
import { C } from "./tokens";
import type { Screen } from "./types";

interface DraftsScreenProps {
  go: (screen: Screen) => void;
}

export function DraftsScreen({ go }: DraftsScreenProps) {
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
        <div style={{ borderTop: `1px solid ${C.b6}` }}>
          {DRAFTS.map((d, i) => (
            <div
              key={d.title}
              {...clickable(() => go("write"))}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                padding: "20px 16px",
                borderBottom:
                  i === DRAFTS.length - 1 ? "none" : `1px solid ${C.b6}`,
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
                    {d.title}
                  </span>
                  {d.current && (
                    <Badge variant="primary" size="sm">
                      Open now
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
                    {d.updated}
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
                  {d.excerpt}
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
                  <span>{d.words} words</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{ fontFamily: C.mono }}>{d.tags}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
