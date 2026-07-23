"use client";

import {
  $isCodeNode,
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  getCodeLanguageOptions,
  getDefaultCodeLanguage,
  registerCodeHighlighting,
} from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import * as stylex from "@stylexjs/stylex";
import { $getNodeByKey, $getRoot } from "lexical";
import { useCallback, useEffect, useState } from "react";

import { uiColor } from "../../theme/color.stylex";
import { fontFamily, fontSize } from "../../theme/typography.stylex";

const LANGUAGE_OPTIONS: Array<[string, string]> = getCodeLanguageOptions();

const styles = stylex.create({
  // A header bar pinned to the top of each code block. Positioned in the
  // editor's own coordinate space (offset from the relative editor shell) so it
  // scrolls with the content instead of floating over the viewport.
  header: (top: number, left: number, width: number) => ({
    position: "absolute",
    top,
    left,
    width,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    height: 34,
    paddingInlineStart: 12,
    paddingInlineEnd: 8,
    borderStartStartRadius: 8,
    borderStartEndRadius: 8,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: uiColor.border1,
    backgroundColor: uiColor.bgSubtle,
    zIndex: 2,
  }),
  filename: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    minWidth: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    color: uiColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    outline: "none",
    paddingBlock: 0,
    paddingInline: 0,
  },
  select: {
    flexShrink: 0,
    appearance: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: uiColor.border2,
    borderRadius: 6,
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    paddingBlock: 3,
    paddingInline: 8,
    cursor: "pointer",
  },
});

interface CodeBlock {
  key: string;
  top: number;
  left: number;
  width: number;
  language: string;
}

/**
 * Renders a static header bar at the top of every code block: a filename input
 * on the left and a language selector on the right. Unlike a floating toolbar,
 * each header is anchored to its block and always visible.
 *
 * The language is stored on the Lexical `CodeNode` (serialized into the ```lang
 * fence and driving Prism highlighting). The filename is session-local — the
 * markpub/GFM wire format has no field for it, so it is not yet persisted.
 */
export function CodeBlockHeaderPlugin() {
  const [editor] = useLexicalComposerContext();
  const [blocks, setBlocks] = useState<Array<CodeBlock>>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const recompute = useCallback(() => {
    const next: Array<CodeBlock> = [];
    editor.getEditorState().read(() => {
      for (const child of $getRoot().getChildren()) {
        if (!$isCodeNode(child)) continue;
        const el = editor.getElementByKey(child.getKey());
        if (!el) continue;
        next.push({
          key: child.getKey(),
          top: el.offsetTop,
          left: el.offsetLeft,
          width: el.offsetWidth,
          language: child.getLanguage() ?? getDefaultCodeLanguage(),
        });
      }
    });
    setBlocks(next);
  }, [editor]);

  useEffect(() => {
    const onResize = () => recompute();
    globalThis.addEventListener("resize", onResize);
    recompute();
    return mergeRegister(
      // Live Prism highlighting so the chosen language actually recolors code.
      registerCodeHighlighting(editor),
      editor.registerUpdateListener(() => recompute()),
      () => globalThis.removeEventListener("resize", onResize),
    );
  }, [editor, recompute]);

  const setLanguage = (key: string, language: string) => {
    editor.update(() => {
      const node = $getNodeByKey(key);
      if ($isCodeNode(node)) node.setLanguage(language);
    });
  };

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block) => (
        <div
          key={block.key}
          contentEditable={false}
          {...stylex.props(styles.header(block.top, block.left, block.width))}
        >
          <input
            aria-label="File name"
            placeholder="untitled"
            value={names[block.key] ?? ""}
            onChange={(event) =>
              setNames((prev) => ({ ...prev, [block.key]: event.target.value }))
            }
            {...stylex.props(styles.filename)}
          />
          <select
            aria-label="Code block language"
            value={block.language}
            onChange={(event) => setLanguage(block.key, event.target.value)}
            {...stylex.props(styles.select)}
          >
            {LANGUAGE_OPTIONS.map(([value, friendly]) => (
              <option key={value} value={value}>
                {CODE_LANGUAGE_FRIENDLY_NAME_MAP[value] ?? friendly}
              </option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}
