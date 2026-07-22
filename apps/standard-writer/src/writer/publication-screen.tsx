import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Tooltip } from "@standard-reader/design-system/tooltip";
import { useState } from "react";

import type { Article, Publication } from "./data";
import { STATUS } from "./data";
import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { C } from "./tokens";
import type { Screen } from "./types";

interface ArticleRowProps {
  a: Article;
  onOpen: () => void;
  last: boolean;
}

function ArticleRow({ a, onOpen, last }: ArticleRowProps) {
  const [hover, setHover] = useState(false);
  const st = STATUS[a.status];

  return (
    <div
      {...clickable(onOpen)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        padding: "20px 16px",
        borderBottom: last ? "none" : `1px solid ${C.b6}`,
        cursor: "pointer",
        background: hover ? C.warm : "transparent",
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
            {a.title}
          </span>
          <span style={{ flex: "none", fontSize: 12.5, color: C.mut }}>
            {a.published}
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
          {a.excerpt}
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
              color: st.color,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: st.dot,
              }}
            />
            {st.label}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ fontFamily: C.mono }}>/{a.path}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{a.words} words</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ fontFamily: C.mono }}>rev {a.rev}</span>
        </div>
      </div>
    </div>
  );
}

interface PubDetailScreenProps {
  pub: Publication;
  go: (screen: Screen) => void;
  openDoc: (doc: Article) => void;
}

export function PubDetailScreen({ pub, go, openDoc }: PubDetailScreenProps) {
  const t = pub.theme;

  return (
    <div
      className="sw-scroll"
      style={{ height: "100%", overflow: "auto", background: C.pageBg }}
    >
      <div
        style={{
          background: t.background,
          color: t.foreground,
          borderBottom: `1px solid ${C.b6}`,
        }}
      >
        <div
          style={{
            maxWidth: 940,
            margin: "0 auto",
            padding: "40px 40px 34px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 15,
              background: t.accent,
              color: t.accentForeground,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: C.serif,
              fontSize: 32,
              flex: "none",
            }}
          >
            {pub.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: C.serif,
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {pub.name}
            </div>
            <div
              style={{
                fontSize: 14.5,
                lineHeight: 1.55,
                opacity: 0.82,
                marginTop: 8,
                maxWidth: 560,
              }}
            >
              {pub.desc}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 14,
                fontSize: 12.5,
                opacity: 0.75,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: C.mono,
                }}
              >
                <Ico d={I.link} s={14} />
                https://{pub.url}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: pub.discoverable ? "#4a9d6b" : "transparent",
                    border: pub.discoverable
                      ? "none"
                      : "1.5px solid currentColor",
                  }}
                />
                {pub.discoverable ? "Discoverable" : "Unlisted"}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{pub.articles.length} documents</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: "none",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tooltip text="View in Reader">
                <IconButton
                  variant="tertiary"
                  size="sm"
                  aria-label="View in Reader"
                >
                  <Ico d={I.external} s={17} />
                </IconButton>
              </Tooltip>
              <Tooltip text="Edit identity & theme">
                <IconButton
                  variant="secondary"
                  size="sm"
                  aria-label="Edit identity & theme"
                  onPress={() => go("newpub")}
                >
                  <Ico d={I.settings} s={17} />
                </IconButton>
              </Tooltip>
              <Button variant="primary" size="sm" onPress={() => go("write")}>
                New document
              </Button>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {(
                [
                  "background",
                  "foreground",
                  "accent",
                  "accentForeground",
                ] as const
              ).map((k) => (
                <span
                  key={k}
                  title={k}
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 5,
                    background: t[k],
                    border: "1px solid rgba(0,0,0,0.14)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{ maxWidth: 940, margin: "0 auto", padding: "18px 40px 80px" }}
      >
        <div>
          {pub.articles.map((a, i) => (
            <ArticleRow
              key={a.path}
              a={a}
              last={i === pub.articles.length - 1}
              onOpen={() => openDoc({ ...a, pubName: pub.name })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
