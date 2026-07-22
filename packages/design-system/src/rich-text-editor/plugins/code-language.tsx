"use client";

import {
  $isCodeNode,
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CodeNode,
  getCodeLanguageOptions,
  getDefaultCodeLanguage,
  registerCodeHighlighting,
} from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import * as stylex from "@stylexjs/stylex";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import type { NodeKey } from "lexical";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { uiColor } from "../../theme/color.stylex";
import { radius } from "../../theme/radius.stylex";
import { fontFamily, fontSize } from "../../theme/typography.stylex";

const styles = stylex.create({
  select: (top: number, left: number) => ({
    position: "fixed",
    top,
    left,
    transform: "translateX(-100%)",
    zIndex: 30,
    appearance: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: uiColor.border2,
    borderRadius: radius.sm,
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    paddingBlock: 3,
    paddingInlineStart: 8,
    paddingInlineEnd: 8,
    cursor: "pointer",
    boxShadow: "0 4px 12px -6px rgba(20, 14, 8, 0.4)",
  }),
});

const LANGUAGE_OPTIONS: Array<[string, string]> = getCodeLanguageOptions();

interface Position {
  key: NodeKey;
  top: number;
  left: number;
  language: string;
}

/**
 * Floating language selector for code blocks. When the caret sits inside a
 * `CodeNode`, a compact dropdown appears pinned to the block's top-right corner
 * so the writer can set the fenced language (which is serialized into the
 * ```lang fence and drives syntax highlighting).
 */
export function CodeLanguagePlugin() {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<Position | null>(null);

  const update = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setState(null);
      return;
    }
    const node = selection.anchor.getNode();
    const codeNode = $isCodeNode(node)
      ? node
      : $getNearestNodeOfType(node, CodeNode);
    if (!$isCodeNode(codeNode)) {
      setState(null);
      return;
    }
    const el = editor.getElementByKey(codeNode.getKey());
    if (!el) {
      setState(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setState({
      key: codeNode.getKey(),
      top: rect.top + 6,
      left: rect.right - 6,
      language: codeNode.getLanguage() ?? getDefaultCodeLanguage(),
    });
  }, [editor]);

  useEffect(() => {
    const onScroll = () => editor.getEditorState().read(update);
    return mergeRegister(
      // Live Prism highlighting so the chosen language actually recolors code.
      registerCodeHighlighting(editor),
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(update);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(update);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      (() => {
        globalThis.addEventListener("scroll", onScroll, true);
        globalThis.addEventListener("resize", onScroll);
        return () => {
          globalThis.removeEventListener("scroll", onScroll, true);
          globalThis.removeEventListener("resize", onScroll);
        };
      })(),
    );
  }, [editor, update]);

  if (!state) return null;

  const setLanguage = (language: string) => {
    editor.update(() => {
      const node = $getNodeByKey(state.key);
      if ($isCodeNode(node)) node.setLanguage(language);
    });
  };

  return createPortal(
    <select
      aria-label="Code block language"
      value={state.language}
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => setLanguage(event.target.value)}
      {...stylex.props(styles.select(state.top, state.left))}
    >
      {LANGUAGE_OPTIONS.map(([value, friendly]) => (
        <option key={value} value={value}>
          {CODE_LANGUAGE_FRIENDLY_NAME_MAP[value] ?? friendly}
        </option>
      ))}
    </select>,
    document.body,
  );
}
