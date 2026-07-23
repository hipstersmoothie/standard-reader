"use client";

import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import * as stylex from "@stylexjs/stylex";
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  Sigma,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../../button";
import { Flex } from "../../flex";
import { Popover } from "../../popover";
import { TextField } from "../../text-field";
import { uiInverted } from "../../theme/color.stylex";
import { $createImageNode } from "../nodes/image-node";
import { $createMathNode } from "../nodes/math-node";

const ICON_SIZE = 16;

const styles = stylex.create({
  pill: (top: number, left: number) => ({
    position: "fixed",
    top,
    left,
    transform: "translate(-50%, calc(-100% - 10px))",
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    gap: 2,
    paddingBlock: 4,
    paddingInline: 4,
    borderRadius: 12,
    backgroundColor: uiInverted.component1,
    color: uiInverted.text2,
    boxShadow: "0 12px 32px -10px rgba(20, 14, 8, 0.55)",
  }),
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    paddingBlock: 0,
    paddingInline: 0,
    borderStyle: "none",
    borderRadius: 7,
    backgroundColor: {
      default: "transparent",
      ":hover": uiInverted.component3,
    },
    color: "inherit",
    cursor: "pointer",
  },
  buttonActive: {
    backgroundColor: uiInverted.component3,
  },
  divider: {
    width: 1,
    height: 18,
    marginInline: 3,
    backgroundColor: uiInverted.border1,
  },
  form: {
    minWidth: 240,
  },
});

interface PillButtonProps {
  label: string;
  active?: boolean;
  onPress: () => void;
  children: ReactNode;
}

/**
 * Plain button styled for the dark selection pill. `onMouseDown` preventDefault
 * keeps the editor's text selection alive when the control is clicked.
 */
function PillButton({ label, active, onPress, children }: PillButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      {...stylex.props(styles.button, active === true && styles.buttonActive)}
    >
      {children}
    </button>
  );
}

interface Position {
  top: number;
  left: number;
}

/**
 * Floating selection toolbar — a compact dark pill that appears above the
 * current text selection (Medium-style) with the inline-formatting controls.
 * Block-level insertion lives in the gutter "+" menu; this pill carries the
 * marks a writer reaches for mid-sentence: bold, italic, inline code, links,
 * images, and LaTeX math.
 */
export function FloatingToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [pos, setPos] = useState<Position | null>(null);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    code: false,
    link: false,
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [mathOpen, setMathOpen] = useState(false);
  const [mathTex, setMathTex] = useState("");

  // While a popover is open the DOM selection collapses; keep the pill pinned.
  const pinned = linkOpen || imageOpen || mathOpen;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const updatePosition = useCallback(() => {
    if (pinnedRef.current) return;

    const selection = $getSelection();
    if (
      !$isRangeSelection(selection) ||
      selection.isCollapsed() ||
      selection.getTextContent().trim() === ""
    ) {
      setPos(null);
      return;
    }

    setFormats({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      code: selection.hasFormat("code"),
      link:
        $isLinkNode(selection.anchor.getNode().getParent()) ||
        $isLinkNode(selection.anchor.getNode()),
    });

    const domSelection = globalThis.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      setPos(null);
      return;
    }
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPos(null);
      return;
    }
    setPos({ top: rect.top, left: rect.left + rect.width / 2 });
  }, []);

  useEffect(() => {
    const onScroll = () => updatePosition();
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(updatePosition);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(updatePosition);
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
  }, [editor, updatePosition]);

  const applyLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl.trim() || null);
    setLinkUrl("");
    setLinkOpen(false);
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

  // While pinned, `updatePosition` bails early and keeps the last `pos`.
  if (!pos) return null;

  return createPortal(
    <div {...stylex.props(styles.pill(pos.top, pos.left))}>
      <PillButton
        label="Bold"
        active={formats.bold}
        onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <Bold size={ICON_SIZE} />
      </PillButton>
      <PillButton
        label="Italic"
        active={formats.italic}
        onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <Italic size={ICON_SIZE} />
      </PillButton>
      <PillButton
        label="Inline code"
        active={formats.code}
        onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
      >
        <Code size={ICON_SIZE} />
      </PillButton>

      <span {...stylex.props(styles.divider)} />

      <Popover
        isOpen={linkOpen}
        onOpenChange={setLinkOpen}
        placement="bottom"
        trigger={
          <PillButton label="Link" active={formats.link} onPress={() => {}}>
            <LinkIcon size={ICON_SIZE} />
          </PillButton>
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

      <Popover
        isOpen={imageOpen}
        onOpenChange={setImageOpen}
        placement="bottom"
        trigger={
          <PillButton label="Image" onPress={() => {}}>
            <ImageIcon size={ICON_SIZE} />
          </PillButton>
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
          <PillButton label="Math" onPress={() => {}}>
            <Sigma size={ICON_SIZE} />
          </PillButton>
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
    </div>,
    document.body,
  );
}
