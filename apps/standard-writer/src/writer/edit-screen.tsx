import { Button } from "@standard-reader/design-system/button";
import { RichTextEditor } from "@standard-reader/design-system/rich-text-editor";
import { useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "../integrations/tanstack-query/api-auth.functions";
import type { WriterDocument } from "../integrations/tanstack-query/api-publications.functions";
import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { NameAvatar } from "./name-avatar";
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

interface EditScreenProps {
  doc: WriterDocument | null;
  back: () => void;
}

export function EditScreen({ doc, back }: EditScreenProps) {
  const { data: session } = useQuery(sessionQueryOptions);

  if (!doc) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.pageBg,
          color: C.mut,
        }}
      >
        No document selected.
      </div>
    );
  }

  const authorName = session?.name ?? "You";
  const published = formatDate(doc.publishedAt);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 22px",
          background: C.hover4,
          borderBottom: `1px solid ${C.b7}`,
        }}
      >
        <Ico d={I.clock} s={16} w={1.9} style={{ color: C.a11 }} />
        <div style={{ fontSize: 13, color: C.a11 }}>
          Editing a <strong>published</strong> document — republishing rewrites
          the record in your repo. Reader re-ingests the update.
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: C.mut,
            fontFamily: C.mono,
            flex: "none",
          }}
        >
          {published}
        </span>
      </div>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 22px",
          borderBottom: `1px solid ${C.b6}`,
          background: C.warm,
        }}
      >
        <span
          {...clickable(back)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.mut,
            cursor: "pointer",
            flex: "none",
          }}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          Back
        </span>
        <div style={{ width: 1, height: 22, background: C.b6, flex: "none" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: C.t12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {doc.title || "Untitled"}
          </div>
          {doc.path && (
            <div style={{ fontSize: 11.5, color: C.mut, fontFamily: C.mono }}>
              /{doc.path}
            </div>
          )}
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Button variant="secondary" size="sm">
            Revert
          </Button>
          <Button variant="primary" size="sm">
            Republish
          </Button>
        </div>
      </div>
      <div
        className="sw-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          background: C.pageBg,
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "56px 40px 200px",
          }}
        >
          <h1
            style={{
              fontFamily: C.serif,
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
              color: C.t12,
              textWrap: "balance",
            }}
          >
            {doc.title || "Untitled"}
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "0 0 38px",
              color: C.mut,
              fontSize: 14,
            }}
          >
            <NameAvatar name={authorName} src={session?.image} size="sm" />
            <span>{authorName}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ color: "#4a9d6b" }}>Published</span>
            {published && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{published}</span>
              </>
            )}
          </div>
          <RichTextEditor
            key={doc.uri}
            chrome="bare"
            defaultValue={doc.textContent ?? ""}
            aria-label="Document body"
          />
        </div>
      </div>
    </div>
  );
}
