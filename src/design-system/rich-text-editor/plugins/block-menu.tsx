"use client";

import { $createCodeNode } from "@lexical/code";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { mergeRegister } from "@lexical/utils";
import * as stylex from "@stylexjs/stylex";
import type { ElementNode, LexicalCommand, LexicalEditor } from "lexical";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
} from "lexical";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Table as TableIcon,
  Type,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import { IconButton } from "../../icon-button";
import { Menu, MenuItem } from "../../menu";

const ICON_SIZE = 16;

interface BlockOption {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  apply: (editor: LexicalEditor, blockKey: string) => void;
}

/** Move the selection into `blockKey`, then run `fn` in the same update. */
function turnInto(
  editor: LexicalEditor,
  blockKey: string,
  fn: () => void,
): void {
  editor.update(() => {
    const node = $getNodeByKey(blockKey);
    if ($isElementNode(node)) node.selectEnd();
    fn();
  });
}

/** Place the caret at the end of `blockKey` so the next command targets it. */
function focusBlock(editor: LexicalEditor, blockKey: string): void {
  editor.update(() => {
    const node = $getNodeByKey(blockKey);
    if ($isElementNode(node)) node.selectEnd();
  });
}

function dispatchVoid(
  editor: LexicalEditor,
  command: LexicalCommand<void>,
): void {
  // `dispatchCommand` requires a payload argument even for `void` commands.
  // eslint-disable-next-line unicorn/no-useless-undefined
  editor.dispatchCommand(command, undefined);
}

function setBlocks(factory: () => ElementNode): void {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) $setBlocksType(selection, factory);
}

// Input-free block types. Image and math live in the toolbar because they need
// a URL / TeX prompt; the gutter menu stays a single click.
const BLOCK_OPTIONS: Array<BlockOption> = [
  {
    key: "paragraph",
    label: "Text",
    icon: Type,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createParagraphNode())),
  },
  {
    key: "h1",
    label: "Heading 1",
    icon: Heading1,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createHeadingNode("h1"))),
  },
  {
    key: "h2",
    label: "Heading 2",
    icon: Heading2,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createHeadingNode("h2"))),
  },
  {
    key: "h3",
    label: "Heading 3",
    icon: Heading3,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createHeadingNode("h3"))),
  },
  {
    key: "bulleted",
    label: "Bulleted list",
    icon: List,
    apply: (editor, key) => {
      focusBlock(editor, key);
      dispatchVoid(editor, INSERT_UNORDERED_LIST_COMMAND);
    },
  },
  {
    key: "numbered",
    label: "Numbered list",
    icon: ListOrdered,
    apply: (editor, key) => {
      focusBlock(editor, key);
      dispatchVoid(editor, INSERT_ORDERED_LIST_COMMAND);
    },
  },
  {
    key: "todo",
    label: "To-do list",
    icon: ListChecks,
    apply: (editor, key) => {
      focusBlock(editor, key);
      dispatchVoid(editor, INSERT_CHECK_LIST_COMMAND);
    },
  },
  {
    key: "quote",
    label: "Quote",
    icon: Quote,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createQuoteNode())),
  },
  {
    key: "code",
    label: "Code block",
    icon: Code2,
    apply: (editor, key) =>
      turnInto(editor, key, () => setBlocks(() => $createCodeNode())),
  },
  {
    key: "divider",
    label: "Divider",
    icon: Minus,
    apply: (editor, key) => {
      focusBlock(editor, key);
      dispatchVoid(editor, INSERT_HORIZONTAL_RULE_COMMAND);
    },
  },
  {
    key: "table",
    label: "Table",
    icon: TableIcon,
    apply: (editor, key) => {
      focusBlock(editor, key);
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        columns: "3",
        rows: "3",
        includeHeaders: true,
      });
    },
  },
];

const styles = stylex.create({
  gutter: (top: number) => ({
    position: "absolute",
    insetInlineStart: 0,
    top,
    transform: "translateY(-2px)",
    zIndex: 1,
  }),
});

/**
 * A Medium/Notion-style gutter affordance: a `+` button in the left margin that
 * follows the hovered (or caret) block and opens a menu of block types to turn
 * that block into. Anchor the plugin inside a `position: relative` container so
 * the button positions against block offsets.
 */
export function BlockMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [anchor, setAnchor] = useState<{ key: string; top: number } | null>(
    null,
  );

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    // Map a viewport Y to the top-level block whose box contains it.
    const blockAt = (clientY: number): { key: string; top: number } | null => {
      let found: { key: string; top: number } | null = null;
      editor.getEditorState().read(() => {
        for (const child of $getRoot().getChildren()) {
          const el = editor.getElementByKey(child.getKey());
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (clientY >= rect.top && clientY <= rect.bottom) {
            found = { key: child.getKey(), top: el.offsetTop };
            break;
          }
        }
      });
      return found;
    };

    const onMove = (event: MouseEvent) => {
      const next = blockAt(event.clientY);
      if (next) setAnchor(next);
    };

    root.addEventListener("mousemove", onMove);

    // Also track the caret so keyboard users get the affordance.
    const unregister = mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const top = selection.anchor.getNode().getTopLevelElement();
          if (!top) return;
          const el = editor.getElementByKey(top.getKey());
          if (el) setAnchor({ key: top.getKey(), top: el.offsetTop });
        });
      }),
    );

    return () => {
      root.removeEventListener("mousemove", onMove);
      unregister();
    };
  }, [editor]);

  if (!anchor) return null;

  return (
    <div {...stylex.props(styles.gutter(anchor.top))} contentEditable={false}>
      <Menu
        placement="bottom start"
        trigger={
          <IconButton label="Insert block" variant="tertiary" size="sm">
            <Plus size={ICON_SIZE} />
          </IconButton>
        }
      >
        {BLOCK_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <MenuItem
              key={option.key}
              id={option.key}
              textValue={option.label}
              prefix={<Icon size={ICON_SIZE} />}
              onAction={() => option.apply(editor, anchor.key)}
            >
              {option.label}
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
}
