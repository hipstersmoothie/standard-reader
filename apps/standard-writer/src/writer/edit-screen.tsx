import { Button } from "@standard-reader/design-system/button";
import { RichTextEditor } from "@standard-reader/design-system/rich-text-editor";

import type { Article } from "./data";
import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { NameAvatar } from "./name-avatar";
import { C } from "./tokens";

const EDIT_DOC = [
  "A publication on standard.site is a set of signed records in a repository you control. This document lives in your repo, addressed by its path and signed by your DID — not held on a platform that could revoke it.",
  "",
  "Because the article is the record, revising it is simply writing the record again — no support ticket, no waiting on an editor's queue. Every reader that speaks the schema sees the update the next time it ingests.",
  "",
  "> The repo record stays the source of truth. The app is a client that helps you produce it — it is not the home of your work.",
  "",
  "You own the press.",
].join("\n");

interface EditScreenProps {
  doc: Article | null;
  back: () => void;
}

export function EditScreen({ doc, back }: EditScreenProps) {
  const d: Article = doc ?? {
    title: "Untitled",
    pubName: "",
    path: "",
    published: "",
    words: "",
    readTime: "",
    rev: 1,
    status: "published",
    excerpt: "",
  };
  const scheduled = d.status === "scheduled";

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
          {scheduled ? (
            <span>
              Scheduled — publishes {d.published}. Editing updates the pending
              record in your repo.
            </span>
          ) : (
            <span>
              Editing a <strong>published</strong> document — republishing
              rewrites the record in your repo. Reader re-ingests the update.
            </span>
          )}
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
          rev {d.rev} · {d.published}
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
          {d.pubName}
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
            {d.title}
          </div>
          <div style={{ fontSize: 11.5, color: C.mut, fontFamily: C.mono }}>
            /{d.path}
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Button variant="tertiary" size="sm">
            View in Reader
          </Button>
          <Button variant="secondary" size="sm">
            Revert
          </Button>
          <Button variant="primary" size="sm">
            {scheduled ? "Update" : "Republish"}
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
            {d.title}
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
            <NameAvatar name="Mara Delgado" size="sm" />
            <span>Mara Delgado</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ color: scheduled ? "#8a6d3b" : "#4a9d6b" }}>
              {scheduled ? "Scheduled" : "Published"}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{d.readTime} read</span>
          </div>
          <RichTextEditor
            key={d.path}
            chrome="bare"
            defaultValue={EDIT_DOC}
            aria-label="Document body"
          />
        </div>
      </div>
    </div>
  );
}
