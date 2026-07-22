import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import type { MarkpubRecord } from "@standard-reader/design-system/rich-text-editor";
import { RichTextEditor } from "@standard-reader/design-system/rich-text-editor";
import { Separator } from "@standard-reader/design-system/separator";
import { Tag, TagGroup } from "@standard-reader/design-system/tag-group";
import { TextField } from "@standard-reader/design-system/text-field";
import { useMemo, useState } from "react";

import { STARTER_DOC } from "./data";
import { I, Ico } from "./icons";
import { NameAvatar } from "./name-avatar";
import { C, sectLabel } from "./tokens";
import type { Layout, Screen } from "./types";

function countWords(markdown: string): number {
  const words = markdown
    .replaceAll(/[#>*`_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

interface EditorCanvasProps {
  onWordCount: (count: number) => void;
}

function EditorCanvas({ onWordCount }: EditorCanvasProps) {
  const handleChange = (next: MarkpubRecord) => {
    onWordCount(countWords(next.text.markdown));
  };

  return (
    <div
      className="sw-scroll"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        background: C.pageBg,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 40px 200px",
          position: "relative",
        }}
      >
        <div style={{ marginBottom: 26 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              color: C.mut,
              border: `1px dashed ${C.b7}`,
              borderRadius: 8,
              padding: "6px 11px",
              cursor: "pointer",
            }}
          >
            <Ico d={I.img} s={15} /> Add cover image
          </div>
        </div>

        <input
          aria-label="Document title"
          defaultValue="You Own the Press"
          spellCheck={false}
          style={{
            display: "block",
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 48,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
            color: C.t12,
            padding: 0,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "0 0 40px",
            color: C.mut,
            fontSize: 14,
          }}
        >
          <NameAvatar name="Mara Delgado" size="sm" />
          <span>Mara Delgado</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Draft</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>~5 min read</span>
        </div>

        <RichTextEditor
          chrome="bare"
          defaultValue={STARTER_DOC}
          onChange={handleChange}
          aria-label="Document body"
        />
      </div>
    </div>
  );
}

function WorkbenchRail() {
  return (
    <div
      className="sw-scroll"
      style={{
        width: 352,
        flex: "none",
        height: "100%",
        overflow: "auto",
        borderLeft: `1px solid ${C.b6}`,
        background: C.warm,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div>
        <div style={sectLabel}>Document</div>
        <div
          style={{
            aspectRatio: "16/9",
            borderRadius: 10,
            border: `1.5px dashed ${C.b7}`,
            background: C.pageBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: C.mut,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          <Ico d={I.img} s={22} w={1.6} />
          <span style={{ fontSize: 12.5 }}>Drop cover, or click to upload</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField label="Title" defaultValue="You Own the Press" size="sm" />
          <TextField
            label="Path"
            prefix="/"
            defaultValue="you-own-the-press"
            size="sm"
          />
        </div>
      </div>

      <Separator />

      <div>
        <div style={sectLabel}>Tags</div>
        <TagGroup aria-label="Tags">
          <Tag id="essays">essays</Tag>
          <Tag id="atproto">atproto</Tag>
          <Tag id="ownership">ownership</Tag>
        </TagGroup>
        <div style={{ marginTop: 10 }}>
          <TextField
            aria-label="Add a tag"
            placeholder="Add a tag…"
            size="sm"
          />
        </div>
      </div>

      <Separator />

      <div>
        <div style={sectLabel}>Contributors</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NameAvatar name="Mara Delgado" size="sm" />
          <NameAvatar name="Jonah Reyes" size="sm" />
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: `1.5px dashed ${C.b7}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.mut,
              cursor: "pointer",
            }}
          >
            <Ico d={I.plus} s={15} w={2} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface WriteScreenProps {
  layout: Layout;
  setLayout: (layout: Layout) => void;
  go: (screen: Screen) => void;
}

export function WriteScreen({ layout, setLayout, go }: WriteScreenProps) {
  const [words, setWords] = useState(1240);
  const wordLabel = useMemo(() => words.toLocaleString(), [words]);

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
          gap: 14,
          padding: "12px 22px",
          borderBottom: `1px solid ${C.b6}`,
          background: C.warm,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: C.t12,
              whiteSpace: "nowrap",
            }}
          >
            You Own the Press
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 11.5,
              color: C.mut,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#4a9d6b",
                flex: "none",
              }}
            />
            Saved to draft · just now · {wordLabel} words
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
          <IconButton
            label={
              layout === "workbench"
                ? "Hide document panel"
                : "Show document panel"
            }
            variant={layout === "workbench" ? "secondary" : "tertiary"}
            size="sm"
            onPress={() =>
              setLayout(layout === "workbench" ? "focus" : "workbench")
            }
          >
            <Ico d={I.panel} s={17} />
          </IconButton>
          <Button variant="primary" size="sm" onPress={() => go("publish")}>
            Publish…
          </Button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <EditorCanvas onWordCount={setWords} />
        {layout === "workbench" && <WorkbenchRail />}
      </div>
    </div>
  );
}
