"use client";

import { $createCodeNode } from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
} from "@lexical/rich-text";
import type { HeadingTagType } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import * as stylex from "@stylexjs/stylex";
import type { LexicalCommand } from "lexical";
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  Bold,
  Code,
  Code2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../../button";
import { Flex } from "../../flex";
import { IconButton } from "../../icon-button";
import { Popover } from "../../popover";
import { Select, SelectItem } from "../../select";
import { TextField } from "../../text-field";
import { gap } from "../../theme/semantic-spacing.stylex";
import { ToggleButton } from "../../toggle-button";
import { Toolbar, ToolbarSeparator } from "../../toolbar";
import { $createImageNode } from "../nodes/image-node";
import { $createMathNode } from "../nodes/math-node";

const ICON_SIZE = 16;

const BLOCK_LABELS: Record<string, string> = {
  paragraph: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  quote: "Quote",
  code: "Code block",
};

const BLOCK_KEYS = Object.keys(BLOCK_LABELS);

const styles = stylex.create({
  bar: {
    gap: gap.xs,
    alignItems: "center",
  },
  form: {
    minWidth: 240,
  },
});

/**
 * Editing toolbar built from design-system controls. Reads the current
 * selection to reflect active block type and inline formats, and dispatches
 * Lexical commands to mutate the document.
 */
export function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState<string>("paragraph");
  const [listType, setListType] = useState<
    "bullet" | "number" | "check" | null
  >(null);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    strikethrough: false,
    code: false,
    link: false,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [mathOpen, setMathOpen] = useState(false);
  const [mathTex, setMathTex] = useState("");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    const element = $isRootOrShadowRoot(anchorNode)
      ? anchorNode
      : anchorNode.getTopLevelElementOrThrow();

    const listNode = $getNearestNodeOfType(anchorNode, ListNode);
    if ($isListNode(listNode)) {
      setListType(listNode.getListType());
      setBlockType("paragraph");
    } else {
      setListType(null);
      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else {
        setBlockType(element.getType());
      }
    }

    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setFormats({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      strikethrough: selection.hasFormat("strikethrough"),
      code: selection.hasFormat("code"),
      link: $isLinkNode(parent) || $isLinkNode(node),
    });
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(updateToolbar);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, updateToolbar]);

  const runCommand = (command: LexicalCommand<void>) => {
    // `dispatchCommand` requires a payload argument even for `void` commands.
    // eslint-disable-next-line unicorn/no-useless-undefined
    editor.dispatchCommand(command, undefined);
  };

  const applyBlock = (type: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (type === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else if (type === "quote") {
        $setBlocksType(selection, () => $createQuoteNode());
      } else if (type === "code") {
        $setBlocksType(selection, () => $createCodeNode());
      } else {
        $setBlocksType(selection, () =>
          $createHeadingNode(type as HeadingTagType),
        );
      }
    });
  };

  const toggleList = (
    type: "bullet" | "number" | "check",
    command: typeof INSERT_UNORDERED_LIST_COMMAND,
  ) => {
    if (listType === type) {
      runCommand(REMOVE_LIST_COMMAND);
    } else {
      runCommand(command);
    }
  };

  const insertImage = () => {
    if (!imageSrc.trim()) return;
    editor.update(() => {
      $insertNodes([
        $createImageNode({ src: imageSrc.trim(), altText: imageAlt.trim() }),
      ]);
    });
    setImageSrc("");
    setImageAlt("");
    setImageOpen(false);
  };

  const insertMath = () => {
    if (!mathTex.trim()) return;
    editor.update(() => {
      $insertNodes([$createMathNode({ tex: mathTex.trim(), inline: false })]);
    });
    setMathTex("");
    setMathOpen(false);
  };

  const applyLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl.trim() || null);
    setLinkUrl("");
    setLinkOpen(false);
  };

  return (
    <Toolbar aria-label="Formatting" style={styles.bar}>
      <IconButton
        label="Undo"
        variant="tertiary"
        size="sm"
        isDisabled={!canUndo}
        onPress={() => runCommand(UNDO_COMMAND)}
      >
        <Undo2 size={ICON_SIZE} />
      </IconButton>
      <IconButton
        label="Redo"
        variant="tertiary"
        size="sm"
        isDisabled={!canRedo}
        onPress={() => runCommand(REDO_COMMAND)}
      >
        <Redo2 size={ICON_SIZE} />
      </IconButton>

      <ToolbarSeparator />

      <Select
        aria-label="Block type"
        size="sm"
        selectedKey={blockType}
        onSelectionChange={(key) => key != null && applyBlock(String(key))}
      >
        {BLOCK_KEYS.map((key) => (
          <SelectItem key={key} id={key} textValue={BLOCK_LABELS[key]}>
            {BLOCK_LABELS[key]}
          </SelectItem>
        ))}
      </Select>

      <ToolbarSeparator />

      <ToggleButton
        aria-label="Bold"
        variant="tertiary"
        size="sm"
        isSelected={formats.bold}
        onChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <Bold size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Italic"
        variant="tertiary"
        size="sm"
        isSelected={formats.italic}
        onChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <Italic size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Strikethrough"
        variant="tertiary"
        size="sm"
        isSelected={formats.strikethrough}
        onChange={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
      >
        <Strikethrough size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Inline code"
        variant="tertiary"
        size="sm"
        isSelected={formats.code}
        onChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
      >
        <Code size={ICON_SIZE} />
      </ToggleButton>

      <Popover
        isOpen={linkOpen}
        onOpenChange={setLinkOpen}
        placement="bottom"
        trigger={
          <ToggleButton
            aria-label="Link"
            variant="tertiary"
            size="sm"
            isSelected={formats.link}
          >
            <LinkIcon size={ICON_SIZE} />
          </ToggleButton>
        }
      >
        <Flex direction="column" gap="md" style={styles.form}>
          <TextField
            label="URL"
            value={linkUrl}
            onChange={setLinkUrl}
            placeholder="https://example.com"
            type="url"
          />
          <Button size="sm" onPress={applyLink}>
            {formats.link && !linkUrl.trim() ? "Remove link" : "Apply link"}
          </Button>
        </Flex>
      </Popover>

      <ToolbarSeparator />

      <ToggleButton
        aria-label="Bulleted list"
        variant="tertiary"
        size="sm"
        isSelected={listType === "bullet"}
        onChange={() => toggleList("bullet", INSERT_UNORDERED_LIST_COMMAND)}
      >
        <List size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Numbered list"
        variant="tertiary"
        size="sm"
        isSelected={listType === "number"}
        onChange={() => toggleList("number", INSERT_ORDERED_LIST_COMMAND)}
      >
        <ListOrdered size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Check list"
        variant="tertiary"
        size="sm"
        isSelected={listType === "check"}
        onChange={() => toggleList("check", INSERT_CHECK_LIST_COMMAND)}
      >
        <ListChecks size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Quote"
        variant="tertiary"
        size="sm"
        isSelected={blockType === "quote"}
        onChange={() =>
          applyBlock(blockType === "quote" ? "paragraph" : "quote")
        }
      >
        <Quote size={ICON_SIZE} />
      </ToggleButton>
      <ToggleButton
        aria-label="Code block"
        variant="tertiary"
        size="sm"
        isSelected={blockType === "code"}
        onChange={() => applyBlock(blockType === "code" ? "paragraph" : "code")}
      >
        <Code2 size={ICON_SIZE} />
      </ToggleButton>

      <ToolbarSeparator />

      <IconButton
        label="Horizontal rule"
        variant="tertiary"
        size="sm"
        onPress={() => runCommand(INSERT_HORIZONTAL_RULE_COMMAND)}
      >
        <Minus size={ICON_SIZE} />
      </IconButton>
      <IconButton
        label="Table"
        variant="tertiary"
        size="sm"
        onPress={() =>
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "3",
            rows: "3",
            includeHeaders: true,
          })
        }
      >
        <TableIcon size={ICON_SIZE} />
      </IconButton>

      <Popover
        isOpen={imageOpen}
        onOpenChange={setImageOpen}
        placement="bottom"
        trigger={
          <IconButton label="Image" variant="tertiary" size="sm">
            <ImageIcon size={ICON_SIZE} />
          </IconButton>
        }
      >
        <Flex direction="column" gap="md" style={styles.form}>
          <TextField
            label="Image URL"
            value={imageSrc}
            onChange={setImageSrc}
            placeholder="https://example.com/image.png"
            type="url"
          />
          <TextField
            label="Alt text"
            value={imageAlt}
            onChange={setImageAlt}
            placeholder="Describe the image"
          />
          <Button size="sm" onPress={insertImage} isDisabled={!imageSrc.trim()}>
            Insert image
          </Button>
        </Flex>
      </Popover>

      <Popover
        isOpen={mathOpen}
        onOpenChange={setMathOpen}
        placement="bottom"
        trigger={
          <IconButton label="Math" variant="tertiary" size="sm">
            <Sigma size={ICON_SIZE} />
          </IconButton>
        }
      >
        <Flex direction="column" gap="md" style={styles.form}>
          <TextField
            label="LaTeX"
            value={mathTex}
            onChange={setMathTex}
            placeholder="e = mc^2"
          />
          <Button size="sm" onPress={insertMath} isDisabled={!mathTex.trim()}>
            Insert math
          </Button>
        </Flex>
      </Popover>
    </Toolbar>
  );
}
