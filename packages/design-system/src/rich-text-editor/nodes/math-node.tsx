/* eslint-disable react-refresh/only-export-components */
import * as stylex from "@stylexjs/stylex";
import { renderToString } from "katex";
import type {
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $applyNodeReplacement, DecoratorNode } from "lexical";

import "katex/dist/katex.min.css";

import { criticalColor } from "../../theme/color.stylex";
import { verticalSpace } from "../../theme/semantic-spacing.stylex";
import { fontSize } from "../../theme/typography.stylex";

export interface MathPayload {
  tex: string;
  inline?: boolean;
  key?: NodeKey;
}

export type SerializedMathNode = Spread<
  { tex: string; inline: boolean },
  SerializedLexicalNode
>;

const styles = stylex.create({
  block: {
    display: "block",
    marginBlock: verticalSpace["3xl"],
    textAlign: "center",
    overflowX: "auto",
  },
  inline: {
    display: "inline-block",
  },
  error: {
    color: criticalColor.text1,
    fontSize: fontSize.sm,
  },
});

/** KaTeX-rendered math. `$$…$$` serializes as a block, `$…$` inline. */
export class MathNode extends DecoratorNode<React.ReactElement> {
  __tex: string;
  __inline: boolean;

  static getType(): string {
    return "math";
  }

  static clone(node: MathNode): MathNode {
    return new MathNode(node.__tex, node.__inline, node.__key);
  }

  static importJSON(serializedNode: SerializedMathNode): MathNode {
    return $createMathNode({
      tex: serializedNode.tex,
      inline: serializedNode.inline,
    });
  }

  constructor(tex: string, inline: boolean, key?: NodeKey) {
    super(key);
    this.__tex = tex;
    this.__inline = inline;
  }

  exportJSON(): SerializedMathNode {
    return {
      ...super.exportJSON(),
      type: "math",
      version: 1,
      tex: this.__tex,
      inline: this.__inline,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement(this.__inline ? "span" : "div");
  }

  updateDOM(prevNode: MathNode): boolean {
    return prevNode.__inline !== this.__inline;
  }

  isInline(): boolean {
    return this.__inline;
  }

  getTex(): string {
    return this.__tex;
  }

  decorate(): React.ReactElement {
    let html: string | null = null;
    try {
      html = renderToString(this.__tex, {
        displayMode: !this.__inline,
        throwOnError: false,
      });
    } catch {
      html = null;
    }
    if (html == null) {
      return <span {...stylex.props(styles.error)}>{this.__tex}</span>;
    }
    return (
      <span
        {...stylex.props(this.__inline ? styles.inline : styles.block)}
        // KaTeX emits trusted markup from the TeX source; there is no user HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
}

export function $createMathNode(payload: MathPayload): MathNode {
  return $applyNodeReplacement(
    new MathNode(payload.tex, payload.inline ?? false, payload.key),
  );
}

export function $isMathNode(
  node: LexicalNode | null | undefined,
): node is MathNode {
  return node instanceof MathNode;
}

/* eslint-enable react-refresh/only-export-components */
