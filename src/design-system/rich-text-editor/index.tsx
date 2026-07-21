"use client";

// This module is the editor's public barrel: alongside the RichTextEditor
// component it re-exports the markpub record helpers, which react-refresh flags.
/* eslint-disable react-refresh/only-export-components */
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import * as stylex from "@stylexjs/stylex";
import type { EditorState, LexicalEditor } from "lexical";
import { useCallback, useRef } from "react";

import { focusColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { fontFamily, fontSize, lineHeight } from "../theme/typography.stylex";
import { editorTheme } from "./editor-theme";
import { markdownFromMarkpub, toMarkpubRecord } from "./markpub";
import type { MarkpubRecord, MarkpubTextValue } from "./markpub";
import { EDITOR_NODES } from "./nodes";
import { ToolbarPlugin } from "./plugins/toolbar";
import { MARKPUB_TRANSFORMERS } from "./transformers";

export {
  markdownFromMarkpub,
  toMarkpubRecord,
  type MarkpubRecord,
  type MarkpubTextValue,
} from "./markpub";
export { MARKPUB_TRANSFORMERS } from "./transformers";

const styles = stylex.create({
  root: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    backgroundColor: uiColor.bg,
    overflow: "hidden",
  },
  toolbarWrap: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: uiColor.border1,
    paddingBlock: verticalSpace.sm,
    paddingInline: horizontalSpace.lg,
    backgroundColor: uiColor.bgSubtle,
  },
  editorShell: {
    position: "relative",
  },
  contentEditable: {
    minHeight: verticalSpace["12xl"],
    maxHeight: 640,
    overflowY: "auto",
    paddingBlock: verticalSpace.xl,
    paddingInline: horizontalSpace["3xl"],
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.xl,
    color: uiColor.text2,
    outlineStyle: "none",
    caretColor: uiColor.text2,
  },
  focused: {
    outlineColor: {
      default: "transparent",
      ":has(:focus-visible)": focusColor.ring,
    },
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: -1,
  },
  placeholder: {
    position: "absolute",
    top: verticalSpace.xl,
    insetInlineStart: horizontalSpace["3xl"],
    color: uiColor.text1,
    pointerEvents: "none",
    userSelect: "none",
  },
});

export interface RichTextEditorProps extends Omit<
  StyleXComponentProps<React.ComponentProps<"div">>,
  "onChange" | "defaultValue"
> {
  /**
   * Initial content: a markdown string, an `at.markpub.text` value, or a full
   * `at.markpub.markdown` record. Uncontrolled — the editor owns state after
   * mount.
   */
  defaultValue?: string | MarkpubRecord | MarkpubTextValue;
  /**
   * Called on every edit with the serialized `at.markpub.markdown` record and
   * the raw GFM markdown body.
   */
  onChange?: (record: MarkpubRecord, markdown: string) => void;
  placeholder?: string;
  /** Namespace passed to Lexical; useful when multiple editors share a page. */
  namespace?: string;
  isReadOnly?: boolean;
  "aria-label"?: string;
}

/**
 * A Lexical-powered rich-text editor that reads and writes the
 * `at.markpub.markdown` record format (GFM). Supports headings, lists (bullet,
 * ordered, task), quotes, code blocks, tables, images, horizontal rules, links,
 * inline formatting, and LaTeX math. Chrome is built from design-system
 * components and the editable surface is themed with design-system tokens.
 */
export function RichTextEditor({
  defaultValue,
  onChange,
  placeholder = "Write something…",
  namespace = "markpub-editor",
  isReadOnly = false,
  style,
  "aria-label": ariaLabel = "Rich text editor",
  ...props
}: RichTextEditorProps) {
  const initialMarkdown = markdownFromMarkpub(defaultValue);
  // Serializing on the trailing edge keeps large documents responsive while
  // typing; the record is rebuilt from the settled editor state.
  const frame = useRef<number | null>(null);

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor) => {
      if (!onChange) return;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        editorState.read(() => {
          const markdown = $convertToMarkdownString(MARKPUB_TRANSFORMERS);
          onChange(toMarkpubRecord(markdown), markdown);
        });
      });
    },
    [onChange],
  );

  return (
    <div {...stylex.props(styles.root, style)} {...props}>
      <LexicalComposer
        initialConfig={{
          namespace,
          nodes: EDITOR_NODES,
          theme: editorTheme,
          editable: !isReadOnly,
          editorState: () =>
            $convertFromMarkdownString(
              initialMarkdown,
              MARKPUB_TRANSFORMERS,
              undefined,
              true,
            ),
          onError: (error) => {
            throw error;
          },
        }}
      >
        {isReadOnly ? null : (
          <div {...stylex.props(styles.toolbarWrap)}>
            <ToolbarPlugin />
          </div>
        )}
        <div {...stylex.props(styles.editorShell, styles.focused)}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={ariaLabel}
                aria-placeholder={placeholder}
                placeholder={
                  <div {...stylex.props(styles.placeholder)}>{placeholder}</div>
                }
                {...stylex.props(styles.contentEditable)}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <TablePlugin />
          <HorizontalRulePlugin />
          <TabIndentationPlugin />
          <MarkdownShortcutPlugin transformers={MARKPUB_TRANSFORMERS} />
          {onChange ? (
            <OnChangePlugin
              onChange={handleChange}
              ignoreSelectionChange
              ignoreHistoryMergeTagChange
            />
          ) : null}
        </div>
      </LexicalComposer>
    </div>
  );
}

/* eslint-enable react-refresh/only-export-components */
