/* eslint-disable react-refresh/only-export-components */
import * as stylex from "@stylexjs/stylex";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $applyNodeReplacement, DecoratorNode } from "lexical";

import { uiColor } from "../../theme/color.stylex";
import { radius } from "../../theme/radius.stylex";
import { verticalSpace } from "../../theme/semantic-spacing.stylex";
import { fontSize } from "../../theme/typography.stylex";

export interface ImagePayload {
  src: string;
  altText: string;
  title?: string;
  key?: NodeKey;
}

export type SerializedImageNode = Spread<
  { src: string; altText: string; title?: string },
  SerializedLexicalNode
>;

const styles = stylex.create({
  figure: {
    marginBlock: verticalSpace["3xl"],
    marginInline: 0,
    textAlign: "center",
  },
  image: {
    maxWidth: "100%",
    height: "auto",
    borderRadius: radius.sm,
  },
  caption: {
    marginTop: verticalSpace.sm,
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
});

/**
 * Block image rendered as a decorator. Markdown serialization is handled by the
 * `IMAGE` transformer; this node only owns the in-editor presentation.
 */
export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string;
  __altText: string;
  __title?: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__title, node.__key);
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { src, altText, title } = serializedNode;
    return $createImageNode({ src, altText, title });
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (element: HTMLElement) => {
          const img = element as HTMLImageElement;
          return {
            node: $createImageNode({
              src: img.getAttribute("src") ?? "",
              altText: img.getAttribute("alt") ?? "",
              title: img.getAttribute("title") ?? undefined,
            }),
          };
        },
        priority: 0,
      }),
    };
  }

  constructor(src: string, altText: string, title?: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__title = title;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: "image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
      title: this.__title,
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("img");
    element.setAttribute("src", this.__src);
    element.setAttribute("alt", this.__altText);
    if (this.__title) element.setAttribute("title", this.__title);
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const className = config.theme.image;
    if (typeof className === "string") span.className = className;
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  decorate(): React.ReactElement {
    return (
      <figure {...stylex.props(styles.figure)}>
        <img
          {...stylex.props(styles.image)}
          src={this.__src}
          alt={this.__altText}
          title={this.__title}
        />
        {this.__altText ? (
          <figcaption {...stylex.props(styles.caption)}>
            {this.__altText}
          </figcaption>
        ) : null}
      </figure>
    );
  }
}

export function $createImageNode(payload: ImagePayload): ImageNode {
  return $applyNodeReplacement(
    new ImageNode(payload.src, payload.altText, payload.title, payload.key),
  );
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}

/* eslint-enable react-refresh/only-export-components */
