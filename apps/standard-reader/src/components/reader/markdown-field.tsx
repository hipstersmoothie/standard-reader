"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { Label } from "@standard-reader/design-system/label";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { TextArea } from "@standard-reader/design-system/text-area";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import type {
  InputVariant,
  Size,
} from "@standard-reader/design-system/theme/types";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import { useInputStyles } from "@standard-reader/design-system/theme/useInputStyles";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const styles = stylex.create({
  // The preview mirrors the textarea so toggling Edit/Preview doesn't shift:
  // same font, size, line-height and box padding — only the markdown renders.
  preview: {
    boxSizing: "border-box",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
  },
  bordered: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
  },
  sizeSm: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    paddingBottom: verticalSpace.xxs,
    paddingTop: verticalSpace.xxs,
  },
  sizeMd: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.sm,
  },
  sizeLg: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.lg,
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  // Flush the box padding so a borderless (tertiary) field's text lines up with
  // its label instead of indenting past it.
  flush: {
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
  },
  // A borderless textarea still reserves a 1px border; match it on the preview
  // so toggling Edit/Preview doesn't nudge the text by a pixel.
  ghostBorder: {
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 1,
  },
  // Markdown elements inherit font/size/line-height from the preview box; only
  // block rhythm and inline weight are set here. The paragraph gap approximates
  // the blank line between paragraphs in the source textarea.
  p: {
    marginBottom: { default: "1.4em", ":last-child": 0 },
    marginTop: 0,
  },
  list: {
    paddingInlineStart: "1.4em",
    marginBottom: { default: "1.4em", ":last-child": 0 },
    marginTop: 0,
  },
  bold: {
    fontWeight: fontWeight.semibold,
  },
  link: {
    color: "inherit",
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
  },
});

/** Minimal renderer: semantic elements that inherit the preview box typography. */
const previewComponents: Components = {
  p: ({ className: _c, style: _s, node: _n, ...props }) => (
    <p {...stylex.props(styles.p)} {...props} />
  ),
  ul: ({ className: _c, style: _s, node: _n, ...props }) => (
    <ul {...stylex.props(styles.list)} {...props} />
  ),
  ol: ({ className: _c, style: _s, node: _n, ...props }) => (
    <ol {...stylex.props(styles.list)} {...props} />
  ),
  strong: ({ className: _c, style: _s, node: _n, ...props }) => (
    <strong {...stylex.props(styles.bold)} {...props} />
  ),
  a: ({ className: _c, style: _s, node: _n, ...props }) => (
    // react-markdown supplies the link text as children via {...props}.
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    <a
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.link)}
      {...props}
    />
  ),
};

const SIZE_STYLE = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
} as const;

/**
 * A markdown input with an Edit/Preview toggle. We don't have a rich-text
 * editor, so authors write markdown and preview the rendered result. The
 * preview is typeset to match the textarea so toggling doesn't reflow. Reused
 * for the collection editorial and per-piece notes.
 */
export function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  size = "md",
  variant = "primary",
  style,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  size?: Size;
  variant?: InputVariant;
  style?: stylex.StyleXStyles;
}) {
  const { t } = useLingui();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const trimmed = value.trim();
  const flush = variant === "tertiary";
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant: "vertical",
    validationState: undefined,
  });

  return (
    <Flex direction="column" gap="sm" style={style}>
      <Flex align="center" justify="between" gap="md">
        <Label size={size} style={flush ? styles.flush : inputStyles.label}>
          {label}
        </Label>
        <SegmentedControl
          aria-label={t`${label} mode`}
          selectedKeys={new Set([mode])}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "edit" || next === "preview") setMode(next);
          }}
        >
          <SegmentedControlItem id="edit">
            <Trans>Edit</Trans>
          </SegmentedControlItem>
          <SegmentedControlItem id="preview">
            <Trans>Preview</Trans>
          </SegmentedControlItem>
        </SegmentedControl>
      </Flex>

      {mode === "edit" ? (
        <TextArea
          aria-label={label}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          size={size}
          variant={variant}
          inputStyle={flush ? styles.flush : undefined}
        />
      ) : (
        <div
          {...stylex.props(
            styles.preview,
            SIZE_STYLE[size],
            flush ? [styles.flush, styles.ghostBorder] : styles.bordered,
          )}
        >
          {trimmed ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={previewComponents}
            >
              {trimmed}
            </ReactMarkdown>
          ) : (
            <span {...stylex.props(styles.empty)}>
              <Trans>Nothing to preview yet.</Trans>
            </span>
          )}
        </div>
      )}
    </Flex>
  );
}
