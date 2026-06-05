import * as stylex from "@stylexjs/stylex";
import { LinkIcon } from "lucide-react";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHover } from "react-aria";

import type { FlexProps } from "../flex";
import type { StyleXComponentProps, TextVariant } from "../theme/types";

import { CopyToClipboardButton } from "../copy-to-clipboard-button";
import { Flex } from "../flex";
import { LinkContext } from "../link/link-context";
import { animationDuration } from "../theme/animations.stylex";
import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { critical, ui } from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
  typeramp,
} from "../theme/typography.stylex";

const styles = stylex.create({
  pre: {
    borderColor: uiColor.border2,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    display: "flex",
    position: "relative",
    marginBottom: verticalSpace["7xl"],
    marginTop: verticalSpace["7xl"],
  },
  preCode: {
    overflow: "auto",
    paddingBottom: verticalSpace["2xl"],
    paddingLeft: horizontalSpace["2xl"],
    paddingRight: horizontalSpace["2xl"],
    paddingTop: verticalSpace["2xl"],
    width: "100%",
  },
  copyButton: {
    position: "absolute",
    right: horizontalSpace["xl"],
    top: verticalSpace["lg"],
  },
  blockquote: {
    gap: gap["4xl"],
    color: ui.textDim,
    display: "flex",
    flexDirection: "column",
    fontFamily: fontFamily["serif"],
    borderLeftColor: ui.borderDim,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    marginBottom: 0,
    marginLeft: horizontalSpace["md"],
    marginRight: 0,
    marginTop: 0,
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["3xl"],
    paddingTop: verticalSpace["md"],
  },
  unorderedList: {
    gap: gap["xl"],
    display: "flex",
    flexDirection: "column",
    listStyleType: "disc",
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingLeft: horizontalSpace["7xl"],
  },
  orderedList: {
    gap: gap["xl"],
    display: "flex",
    flexDirection: "column",
    listStyleType: "decimal",
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingLeft: horizontalSpace["7xl"],
  },
  listItem: {
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["base"],
    lineHeight: lineHeight["base"],
    paddingLeft: horizontalSpace["xs"],
  },
  inlineCode: {
    borderRadius: radius.sm,
    cornerShape: "squircle",
    fontSize: "0.95em",
    position: "relative",
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
    paddingTop: verticalSpace["xs"],
    top: "-0.01em",
  },
  underline: {
    textDecorationLine: "underline",
  },
  textEllipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkedHeadingLink: {
    textDecoration: "none",
    color: "inherit",
  },
  linkedHeadingLinkButton: {
    opacity: {
      default: 0,
      ":is([data-focus-visible])": 1,
      ":is([data-heading-link][data-hovered] *)": 1,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: "ease-in-out",
  },
});

export interface Heading1Props extends StyleXComponentProps<
  React.ComponentProps<"h1">
> {}

export const Heading1 = ({ style, ...props }: Heading1Props) => {
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h1 {...props} {...stylex.props(typeramp.heading1, style)} />;
};

export interface Heading2Props extends StyleXComponentProps<
  React.ComponentProps<"h2">
> {}

export const Heading2 = ({ style, ...props }: Heading2Props) => {
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h2 {...props} {...stylex.props(typeramp.heading2, style)} />;
};

export interface Heading3Props extends StyleXComponentProps<
  React.ComponentProps<"h3">
> {}

export const Heading3 = ({ style, ...props }: Heading3Props) => {
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h3 {...props} {...stylex.props(typeramp.heading3, style)} />;
};

export interface Heading4Props extends StyleXComponentProps<
  React.ComponentProps<"h4">
> {}

export const Heading4 = ({ style, ...props }: Heading4Props) => {
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h4 {...props} {...stylex.props(typeramp.heading4, style)} />;
};

export interface Heading5Props extends StyleXComponentProps<
  React.ComponentProps<"h5">
> {}

export const Heading5 = ({ style, ...props }: Heading5Props) => {
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h5 {...props} {...stylex.props(typeramp.heading5, style)} />;
};

export interface BodyProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {
  variant?: TextVariant;
}

export const Body = ({ style, variant = "primary", ...props }: BodyProps) => {
  const contextValue = useMemo(
    () => ({
      style: [
        variant === "secondary" && ui.textDim,
        variant === "critical" && critical.textDim,
      ],
    }),
    [variant],
  );

  return (
    <LinkContext value={contextValue}>
      <p
        {...props}
        {...stylex.props(
          typeramp.body,
          variant === "secondary" && ui.textDim,
          variant === "critical" && critical.textDim,
          style,
        )}
      />
    </LinkContext>
  );
};

export interface SmallBodyProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {
  variant?: TextVariant;
}

export const SmallBody = ({
  style,
  variant = "primary",
  ...props
}: SmallBodyProps) => {
  const contextValue = useMemo(
    () => ({
      style: [
        variant === "secondary" && ui.textDim,
        variant === "critical" && critical.textDim,
        styles.underline,
      ],
    }),
    [variant],
  );

  return (
    <LinkContext value={contextValue}>
      <p
        {...props}
        {...stylex.props(
          typeramp.smallBody,
          variant === "secondary" && ui.textDim,
          variant === "critical" && critical.textDim,
          style,
        )}
      />
    </LinkContext>
  );
};

interface LabelTextProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {
  variant?: TextVariant;
  hasEllipsis?: boolean;
}

export const LabelText = ({
  style,
  variant = "primary",
  hasEllipsis = false,
  ...props
}: LabelTextProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        typeramp.label,
        variant === "secondary" && ui.textDim,
        variant === "critical" && critical.textDim,
        hasEllipsis && styles.textEllipsis,
        style,
      )}
    />
  );
};

interface SubLabelProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {
  variant?: TextVariant;
}

export const SubLabel = ({
  style,
  variant = "primary",
  ...props
}: SubLabelProps) => {
  const contextValue = useMemo(
    () => ({
      style: [
        variant === "secondary" && ui.textDim,
        variant === "critical" && critical.textDim,
        styles.underline,
      ],
    }),
    [variant],
  );

  return (
    <LinkContext value={contextValue}>
      <p
        {...props}
        {...stylex.props(
          typeramp.sublabel,
          variant === "secondary" && ui.textDim,
          variant === "critical" && critical.textDim,
          style,
        )}
      />
    </LinkContext>
  );
};

export interface BlockquoteProps extends StyleXComponentProps<
  React.ComponentProps<"blockquote">
> {}

export const Blockquote = ({ style, ...props }: BlockquoteProps) => {
  return <blockquote {...props} {...stylex.props(styles.blockquote, style)} />;
};

export interface UnorderedListProps extends StyleXComponentProps<
  React.ComponentProps<"ul">
> {}

export const UnorderedList = ({ style, ...props }: UnorderedListProps) => {
  return <ul {...props} {...stylex.props(styles.unorderedList, style)} />;
};

export interface OrderedListProps extends StyleXComponentProps<
  React.ComponentProps<"ol">
> {}

export const OrderedList = ({ style, ...props }: OrderedListProps) => {
  return <ol {...props} {...stylex.props(styles.orderedList, style)} />;
};

export interface ListItemProps extends StyleXComponentProps<
  React.ComponentProps<"li">
> {}

export const ListItem = ({ style, children, ...props }: ListItemProps) => {
  return (
    <li {...props} {...stylex.props(styles.listItem, style)}>
      {children}
    </li>
  );
};

const PreContext = createContext(false);

export interface PreProps extends StyleXComponentProps<
  React.ComponentProps<"pre">
> {}

export function Pre({ style, children, ...props }: PreProps) {
  const [textContent, setTextContent] = useState("error");
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setTextContent(ref.current?.textContent ?? "error");
  }, [ref]);

  return (
    <PreContext value={true}>
      <pre
        ref={ref}
        {...props}
        {...stylex.props(styles.pre, style)}
        data-testid="code"
      >
        {children}
        <CopyToClipboardButton style={styles.copyButton} text={textContent} />
      </pre>
    </PreContext>
  );
}

export interface InlineCodeProps extends StyleXComponentProps<
  React.ComponentProps<"code">
> {}

export const InlineCode = ({ style, ...props }: InlineCodeProps) => {
  const isPre = use(PreContext);

  if (isPre) {
    return <code {...props} {...stylex.props(styles.preCode, style)} />;
  }

  return (
    <code
      {...props}
      {...stylex.props(styles.inlineCode, ui.bgSecondary, style)}
    />
  );
};

/**
 * Props for the LinkedHeading component.
 */
export interface LinkedHeadingProps {
  /**
   * The ID of the heading, used to create the anchor link.
   * If not provided, the component will just render the children.
   */
  id?: string;
  /**
   * The heading content to display.
   */
  children: React.ReactNode;
  /**
   * Optional style to apply to the container.
   */
  style?: stylex.StyleXStyles;
}

/**
 * A wrapper component for headings that adds a link and copy-to-clipboard button.
 * The link allows users to jump to the heading, and the button copies the full URL
 * with the anchor to the clipboard.
 */
export const LinkedHeading = ({ id, children, style }: LinkedHeadingProps) => {
  const { hoverProps, isHovered } = useHover({});

  if (!id) {
    return <>{children}</>;
  }

  const url =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    globalThis.window === undefined
      ? `#${id}`
      : `${globalThis.location.origin}${globalThis.location.pathname}#${id}`;

  return (
    <Flex
      direction="row"
      gap="md"
      align="center"
      data-heading-link
      data-hovered={isHovered || undefined}
      {...(hoverProps as FlexProps)}
      style={style}
    >
      <a href={`#${id}`} {...stylex.props(styles.linkedHeadingLink)}>
        {children}
      </a>
      <CopyToClipboardButton
        text={url}
        icon={<LinkIcon />}
        style={styles.linkedHeadingLinkButton}
      />
    </Flex>
  );
};
