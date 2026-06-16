"use client";

import type { Components } from "react-markdown";

import * as stylex from "@stylexjs/stylex";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { LinkProps } from "../link";
import type { StyleXComponentProps } from "../theme/types";

import { Link } from "../link";
import { verticalSpace } from "../theme/semantic-spacing.stylex";
import {
  Blockquote,
  Body,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  InlineCode,
  ListItem,
  OrderedList,
  Pre,
  UnorderedList,
} from "../typography";
import { Text } from "../typography/text";

const styles = stylex.create({
  root: {},
  italic: {
    fontStyle: "italic",
  },
  standardMargin: {
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace["4xl"],
  },
  h2: {
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["7xl"],
  },
  h3: {
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace["7xl"],
  },
  h4: {
    marginBottom: verticalSpace["7xl"],
    marginTop: verticalSpace["7xl"],
  },
  h5: {
    marginBottom: verticalSpace["7xl"],
    marginTop: verticalSpace["7xl"],
  },
  // Tight block spacing for inline previews — paragraphs sit about one blank
  // line apart (like the source textarea) rather than the prose page rhythm,
  // and the first/last block sheds its outer margin so the box hugs content.
  compactBlock: {
    marginBottom: { default: verticalSpace["lg"], ":last-child": 0 },
    marginTop: 0,
  },
});

/** Build the react-markdown element map; `compact` tightens block spacing. */
function buildComponents(compact: boolean): Components {
  const block = compact ? styles.compactBlock : undefined;
  return {
    h1: ({ className: _className, style: _style, ...props }) => (
      <Heading1 style={block} {...props} />
    ),
    h2: ({ className: _className, style: _style, ...props }) => (
      <Heading2 style={block ?? styles.h2} {...props} />
    ),
    h3: ({ className: _className, style: _style, ...props }) => (
      <Heading3 style={block ?? styles.h3} {...props} />
    ),
    h4: ({ className: _className, style: _style, ...props }) => (
      <Heading4 style={block ?? styles.h4} {...props} />
    ),
    h5: ({ className: _className, style: _style, ...props }) => (
      <Heading5 style={block ?? styles.h5} {...props} />
    ),
    p: ({ className: _className, style: _style, ...props }) => (
      <Body style={block ?? styles.standardMargin} {...props} />
    ),
    a: ({ className: _className, style: _style, ...props }) => (
      <Link {...(props as LinkProps)} />
    ),
    ul: ({ className: _className, style: _style, ...props }) => (
      <UnorderedList {...props} />
    ),
    ol: ({ className: _className, style: _style, ...props }) => (
      <OrderedList {...props} />
    ),
    li: ({ className: _className, style: _style, ...props }) => (
      <ListItem {...props} />
    ),
    pre: ({ className: _className, style: _style, ...props }) => (
      <Pre {...props} />
    ),
    code: ({ className: _className, style: _style, ...props }) => (
      <InlineCode {...props} />
    ),
    blockquote: ({ className: _className, style: _style, ...props }) => (
      <Blockquote {...props} />
    ),
    strong: ({ children }) => <Text weight="semibold">{children}</Text>,
    em: ({ children }) => <em {...stylex.props(styles.italic)}>{children}</em>,
  };
}

/** Map of react-markdown element types to Hip typography; not a React component. */
// oxlint-disable-next-line react-refresh/only-export-components
export const components: Components = buildComponents(false);
const compactComponents: Components = buildComponents(true);

/**
 * Props for the MarkdownContent component.
 */
export interface MarkdownContentProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * The markdown string to render.
   */
  content: string;
  /** Tighten block spacing for inline previews (e.g. an edit/preview toggle). */
  compact?: boolean;
}

/**
 * Renders GitHub-flavored markdown with sanitization to prevent XSS.
 */
export function MarkdownContent({
  content,
  style,
  compact = false,
  ...props
}: MarkdownContentProps) {
  return (
    <div {...stylex.props(styles.root, style)} {...props}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={compact ? compactComponents : components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
