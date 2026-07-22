import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import type { MarkpubRecord } from "@standard-reader/design-system/rich-text-editor";
import { RichTextEditor } from "@standard-reader/design-system/rich-text-editor";
import { Separator } from "@standard-reader/design-system/separator";
import { Tag, TagGroup } from "@standard-reader/design-system/tag-group";
import { TextField } from "@standard-reader/design-system/text-field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { sessionQueryOptions } from "../integrations/tanstack-query/api-auth.functions";
import {
  draftsApi,
  draftsQueryOptions,
} from "../integrations/tanstack-query/api-drafts.functions";
import { STARTER_DOC } from "./data";
import { I, Ico } from "./icons";
import { NameAvatar } from "./name-avatar";
import { C, sectLabel } from "./tokens";
import type { Layout, Screen } from "./types";

function countWords(markdown: string): number {
  return markdown
    .replaceAll(/[#>*`_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

interface EditorCanvasProps {
  title: string;
  defaultMarkdown: string;
  onTitleChange: (title: string) => void;
  onBodyChange: (markdown: string) => void;
}

function EditorCanvas({
  title,
  defaultMarkdown,
  onTitleChange,
  onBodyChange,
}: EditorCanvasProps) {
  return (
    <div
      className="sw-scroll"
      style={{ flex: 1, minWidth: 0, overflow: "auto", background: C.pageBg }}
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
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Untitled"
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
          defaultValue={defaultMarkdown}
          onChange={(record: MarkpubRecord) =>
            onBodyChange(record.text.markdown)
          }
          aria-label="Document body"
        />
      </div>
    </div>
  );
}

function WorkbenchRail({ title }: { title: string }) {
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
          <TextField label="Title" value={title} isReadOnly size="sm" />
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
  draftId: string | undefined;
  onDraftIdChange: (id: string) => void;
}

export function WriteScreen({
  layout,
  setLayout,
  go,
  draftId,
  onDraftIdChange,
}: WriteScreenProps) {
  const { data: session } = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();

  const draftQuery = useQuery({
    queryKey: ["draft", draftId],
    queryFn: () => draftsApi.getDraft({ data: { id: draftId as string } }),
    enabled: draftId != null,
  });
  const loaded = draftId === undefined ? null : (draftQuery.data ?? null);

  const [title, setTitle] = useState("You Own the Press");
  const [markdown, setMarkdown] = useState(STARTER_DOC);
  const [touched, setTouched] = useState(false);
  const [seedKey, setSeedKey] = useState("new");
  // Which identity the editor is currently seeded with, so a self-created draft
  // (lifted after the first autosave) doesn't get re-seeded and clobbered when
  // its `getDraft` query later resolves.
  const seededRef = useRef("new");

  useEffect(() => {
    if (draftId == null) {
      if (seededRef.current === "new") return;
      seededRef.current = "new";
      setTitle("You Own the Press");
      setMarkdown(STARTER_DOC);
      setTouched(false);
      setSeedKey(`new:${Date.now()}`);
      return;
    }
    if (loaded && seededRef.current !== `loaded:${loaded.id}`) {
      seededRef.current = `loaded:${loaded.id}`;
      setTitle(loaded.title);
      setMarkdown(loaded.bodyMarkdown);
      setTouched(false);
      setSeedKey(`loaded:${loaded.id}`);
    }
  }, [draftId, loaded]);

  const words = useMemo(() => countWords(markdown), [markdown]);

  const save = useMutation({
    mutationFn: (vars: { title: string; bodyMarkdown: string }) =>
      draftsApi.upsertDraft({ data: { id: draftId, ...vars } }),
    onSuccess: (res) => {
      if (res.id !== draftId) {
        // A freshly-created draft: adopt its id and mark it already-seeded so
        // the incoming getDraft doesn't reset the editor mid-compose.
        seededRef.current = `loaded:${res.id}`;
        onDraftIdChange(res.id);
      }
      void queryClient.invalidateQueries({
        queryKey: draftsQueryOptions.queryKey,
      });
    },
  });

  const saveMutate = save.mutate;
  useEffect(() => {
    if (!session || !touched) return;
    const timer = setTimeout(() => {
      saveMutate({ title, bodyMarkdown: markdown });
    }, 1200);
    return () => clearTimeout(timer);
  }, [title, markdown, touched, session, saveMutate]);

  const status: string = session
    ? save.isPending
      ? "Saving…"
      : save.isSuccess
        ? "Saved to draft · just now"
        : "Draft"
    : "Sign in to save · draft is local";

  const isLoadingDraft = draftId != null && !loaded;

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
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 360,
            }}
          >
            {title || "Untitled"}
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
                background: session ? "#4a9d6b" : "#c99f6a",
                flex: "none",
              }}
            />
            {status} · {words.toLocaleString()} words
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
        {isLoadingDraft ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.mut,
              background: C.pageBg,
            }}
          >
            Loading draft…
          </div>
        ) : (
          <EditorCanvas
            key={seedKey}
            title={title}
            defaultMarkdown={markdown}
            onTitleChange={(next) => {
              setTouched(true);
              setTitle(next);
            }}
            onBodyChange={(next) => {
              setTouched(true);
              setMarkdown(next);
            }}
          />
        )}
        {layout === "workbench" && <WorkbenchRail title={title} />}
      </div>
    </div>
  );
}
