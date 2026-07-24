import { Separator } from "@standard-reader/design-system/separator";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Children, Fragment } from "react";

import { common } from "../common-styles";

/**
 * The shape every settings screen is built from: labelled sections, each a
 * bordered group of rows, each row saying what the setting is on the left and
 * carrying the thing that shows or changes it on the right.
 *
 * Account settings and a newsletter's settings share this so the two screens
 * stay the same screen — one lists values it doesn't own, the other lists
 * controls, but they read as one system.
 */
const styles = stylex.create({
  section: {
    marginBottom: spacing["10"],
  },
  /** The bordered stack a section's rows live in. */
  group: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
    justifyContent: "space-between",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap["4xl"],
  },
  rowLabel: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBlockEnd: verticalSpace.xs,
    marginBlockStart: 0,
  },
  rowDescription: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBlockEnd: 0,
    marginBlockStart: 0,
    // A description is a caption, not a paragraph — it wraps before it becomes
    // a line the eye has to track back across.
    maxWidth: "46ch",
  },
  control: {
    display: "flex",
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  /** A control that is a field rather than a button gets a fixed column, so the
      fields down a group line up with each other. Wide enough to hold a full
      sending address without truncating it. */
  controlField: {
    display: "block",
    width: spacing["72"],
  },
  /** A row whose right side is a value to read, not a control to operate. It is
      allowed to shrink and wrap, since a handle or a URL can outrun its
      column. */
  valueControl: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: "end",
  },
  value: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  valueMono: {
    fontFamily: fontFamily.mono,
    // Identifiers have no spaces to break on, so let them break anywhere rather
    // than push the row wider than its measure.
    overflowWrap: "anywhere",
  },
  /** The row of buttons that closes a group. */
  actionRow: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    justifyContent: "flex-end",
    paddingBlockEnd: verticalSpace["2xl"],
    paddingBlockStart: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap["2xl"],
  },
  /** Aside under a group, explaining the group rather than any one row. */
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: verticalSpace["3xl"],
  },
});

/**
 * A labelled group of settings. Children are the rows; the hairlines between
 * them are drawn here, so a row never has to know what follows it.
 */
export function SettingsSection({
  label,
  note,
  children,
}: {
  label: string;
  /** Aside printed under the group — what the whole group is, or where the
      values come from. */
  note?: ReactNode;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  return (
    <div {...stylex.props(styles.section)}>
      <div {...stylex.props(common.sectionLabel)}>{label}</div>
      <div {...stylex.props(common.card, styles.group)}>
        {rows.map((row, i) => (
          // Rows are a static list per screen, so their position is their
          // identity.
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={i}>
            {i > 0 ? <Separator /> : null}
            {row}
          </Fragment>
        ))}
      </div>
      {note ? <p {...stylex.props(styles.note)}>{note}</p> : null}
    </div>
  );
}

/**
 * One setting: what it is on the left, the control that changes it on the
 * right. The label belongs to the row, so the control carries an `aria-label`
 * rather than printing a second one.
 */
export function SettingRow({
  label,
  description,
  field,
  children,
}: {
  label: string;
  description?: string;
  /** The control is an input, so it takes the fixed field column. */
  field?: boolean;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <div>
        <p {...stylex.props(styles.rowLabel)}>{label}</p>
        {description ? (
          <p {...stylex.props(styles.rowDescription)}>{description}</p>
        ) : null}
      </div>
      <div {...stylex.props(styles.control, field && styles.controlField)}>
        {children}
      </div>
    </div>
  );
}

/**
 * A read-only setting: the same row, but the right side is the value itself.
 * `mono` is for machine identifiers — a handle, a DID, an address, a URL —
 * which read as strings to be compared character by character rather than as
 * prose.
 */
export function SettingValueRow({
  label,
  description,
  mono,
  children,
}: {
  label: string;
  description?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <div>
        <p {...stylex.props(styles.rowLabel)}>{label}</p>
        {description ? (
          <p {...stylex.props(styles.rowDescription)}>{description}</p>
        ) : null}
      </div>
      <div
        {...stylex.props(
          styles.control,
          styles.valueControl,
          styles.value,
          mono && styles.valueMono,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** The row of actions that closes a group — a Save button and its receipt. */
export function SettingsActionRow({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.actionRow)}>{children}</div>;
}
