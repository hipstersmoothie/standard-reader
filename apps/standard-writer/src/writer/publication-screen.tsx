import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Tooltip } from "@standard-reader/design-system/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  myPublicationsQueryOptions,
  publicationDocumentsQueryOptions,
} from "../integrations/tanstack-query/api-publications.functions";
import type {
  WriterDocument,
  WriterPublication,
} from "../integrations/tanstack-query/api-publications.functions";
import { I, Ico } from "./icons";
import { publicationThemeScaleVars } from "./publication-theme-scale";
import { publicationPrimary, publicationUi } from "./publication-theme-tokens";
import { C } from "./tokens";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function excerptOf(doc: WriterDocument): string {
  const source = doc.description ?? doc.textContent ?? "";
  const text = source.replaceAll(/\s+/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

interface ArticleRowProps {
  doc: WriterDocument;
  onOpen: () => void;
  last: boolean;
}

function ArticleRow({ doc, onOpen, last }: ArticleRowProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
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
            {doc.title || "Untitled"}
          </span>
          <span style={{ flex: "none", fontSize: 12.5, color: C.mut }}>
            {formatDate(doc.publishedAt)}
          </span>
        </div>
        {excerptOf(doc) && (
          <div
            style={{
              fontSize: 14.5,
              color: C.a11,
              lineHeight: 1.55,
              marginBottom: 12,
              maxWidth: 620,
            }}
          >
            {excerptOf(doc)}
          </div>
        )}
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
              color: "#3f7d4e",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4a9d6b",
              }}
            />
            Published
          </span>
          {doc.path && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontFamily: C.mono }}>/{doc.path}</span>
            </>
          )}
          {doc.tags && doc.tags.length > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontFamily: C.mono }}>{doc.tags.join(" · ")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PubDetailScreenProps {
  pubId: string;
  onEdit: (pub: WriterPublication) => void;
  openDoc: (doc: WriterDocument) => void;
  newDoc: () => void;
}

export function PubDetailScreen({
  pubId,
  onEdit,
  openDoc,
  newDoc,
}: PubDetailScreenProps) {
  const { data: publications = [] } = useQuery(myPublicationsQueryOptions);
  const { data: documents = [], isPending } = useQuery(
    publicationDocumentsQueryOptions(pubId),
  );
  const pub = publications.find((p) => p.uri === pubId);

  if (!pub) {
    return (
      <div
        className="sw-scroll"
        style={{
          height: "100%",
          overflow: "auto",
          background: C.pageBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.mut,
        }}
      >
        Publication not found.
      </div>
    );
  }

  const t = pub.theme;
  // Derive a Radix-style palette from the publication's theme and apply the
  // `publicationUi` / `publicationPrimary` StyleX themes so the header's
  // buttons pick up the publication's accent instead of the editorial bronze.
  const themeProps = stylex.props(publicationUi, publicationPrimary);

  return (
    <div
      className="sw-scroll"
      style={{ height: "100%", overflow: "auto", background: C.pageBg }}
    >
      <div
        className={themeProps.className}
        style={{
          ...themeProps.style,
          ...publicationThemeScaleVars(t),
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
            {pub.description && (
              <div
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  opacity: 0.82,
                  marginTop: 8,
                  maxWidth: 560,
                }}
              >
                {pub.description}
              </div>
            )}
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
                {pub.url}
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
              <span>
                {documents.length}{" "}
                {documents.length === 1 ? "document" : "documents"}
              </span>
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
              <Tooltip text="Edit identity & theme">
                <IconButton
                  variant="secondary"
                  size="sm"
                  aria-label="Edit identity & theme"
                  onPress={() => onEdit(pub)}
                >
                  <Ico d={I.settings} s={17} />
                </IconButton>
              </Tooltip>
              <Button variant="primary" size="sm" onPress={newDoc}>
                New document
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{ maxWidth: 940, margin: "0 auto", padding: "18px 40px 80px" }}
      >
        {isPending ? (
          <div
            style={{ padding: "48px 16px", textAlign: "center", color: C.mut }}
          >
            Loading documents…
          </div>
        ) : documents.length === 0 ? (
          <div
            style={{
              padding: "48px 16px",
              textAlign: "center",
              color: C.mut,
            }}
          >
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.t12 }}>
              No documents yet
            </div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              Publish a document to this publication and it will appear here.
            </div>
          </div>
        ) : (
          <div>
            {documents.map((d, i) => (
              <ArticleRow
                key={d.uri}
                doc={d}
                last={i === documents.length - 1}
                onOpen={() => openDoc(d)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
