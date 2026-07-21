import * as stylex from "@stylexjs/stylex";
import type { EditorThemeClasses } from "lexical";

import { primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../theme/typography.stylex";

/**
 * StyleX rules for the editable surface. These map 1:1 to Lexical's
 * `EditorThemeClasses`: Lexical stamps the generated class name onto the DOM
 * node it renders for each node type, so styling the editor means styling
 * these keys rather than the design-system React components (Lexical owns the
 * DOM). Tokens are pulled from the design system so the editor matches prose
 * rendered elsewhere.
 */
const styles = stylex.create({
  paragraph: {
    marginBlock: verticalSpace["3xl"],
    fontSize: fontSize.base,
    lineHeight: lineHeight.xl,
  },
  h1: {
    marginTop: verticalSpace["7xl"],
    marginBottom: verticalSpace["3xl"],
    fontFamily: fontFamily.title,
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.xs,
  },
  h2: {
    marginTop: verticalSpace["7xl"],
    marginBottom: verticalSpace["3xl"],
    fontFamily: fontFamily.title,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.xs,
  },
  h3: {
    marginTop: verticalSpace["4xl"],
    marginBottom: verticalSpace["md"],
    fontFamily: fontFamily.title,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
  h4: {
    marginTop: verticalSpace["4xl"],
    marginBottom: verticalSpace["md"],
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
  h5: {
    marginTop: verticalSpace["3xl"],
    marginBottom: verticalSpace["xs"],
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.base,
  },
  h6: {
    marginTop: verticalSpace["3xl"],
    marginBottom: verticalSpace["xs"],
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: uiColor.text1,
    lineHeight: lineHeight.base,
  },
  quote: {
    marginBlock: verticalSpace["3xl"],
    marginInline: 0,
    paddingInlineStart: horizontalSpace["3xl"],
    borderInlineStartWidth: horizontalSpace.md,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: uiColor.border2,
    color: uiColor.text1,
    fontStyle: "italic",
  },
  list: {
    marginBlock: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["7xl"],
  },
  listItem: {
    marginBlock: verticalSpace.xs,
    lineHeight: lineHeight.xl,
  },
  nestedListItem: {
    listStyleType: "none",
  },
  listItemChecked: {
    position: "relative",
    listStyleType: "none",
    marginInlineStart: horizontalSpace.md,
    paddingInlineStart: horizontalSpace["3xl"],
    textDecorationLine: "line-through",
    outline: "none",
  },
  listItemUnchecked: {
    position: "relative",
    listStyleType: "none",
    marginInlineStart: horizontalSpace.md,
    paddingInlineStart: horizontalSpace["3xl"],
    outline: "none",
  },
  link: {
    color: primaryColor.text1,
    textDecorationLine: "underline",
    cursor: "pointer",
  },
  bold: { fontWeight: fontWeight.bold },
  italic: { fontStyle: "italic" },
  underline: { textDecorationLine: "underline" },
  strikethrough: { textDecorationLine: "line-through" },
  underlineStrikethrough: { textDecorationLine: "underline line-through" },
  code: {
    backgroundColor: uiColor.component1,
    borderRadius: radius.xs,
    paddingBlock: verticalSpace.xxs,
    paddingInline: horizontalSpace.xs,
    fontFamily: fontFamily.mono,
    fontSize: "0.9em",
  },
  highlight: {
    backgroundColor: primaryColor.bgSubtle,
    borderRadius: radius.xs,
  },
  codeBlock: {
    display: "block",
    marginBlock: verticalSpace["3xl"],
    padding: verticalSpace.xl,
    backgroundColor: uiColor.component1,
    borderRadius: radius.md,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.lg,
    overflowX: "auto",
    whiteSpace: "pre",
    tabSize: 2,
  },
  table: {
    marginBlock: verticalSpace["3xl"],
    borderCollapse: "collapse",
    width: "100%",
    overflowY: "scroll",
  },
  tableCell: {
    minWidth: horizontalSpace["11xl"],
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColor.border2,
    paddingBlock: verticalSpace.sm,
    paddingInline: horizontalSpace.lg,
    verticalAlign: "top",
    textAlign: "start",
  },
  tableCellHeader: {
    backgroundColor: uiColor.component1,
    fontWeight: fontWeight.semibold,
  },
});

/** Extract the StyleX-generated class name for one rule. */
const cls = (...rules: Array<stylex.StyleXStyles>): string =>
  stylex.props(...rules).className ?? "";

/**
 * Build the Lexical theme. Returns generated class names keyed by node type so
 * Lexical can attach design-system styling to the DOM it renders.
 */
export const editorTheme: EditorThemeClasses = {
  paragraph: cls(styles.paragraph),
  heading: {
    h1: cls(styles.h1),
    h2: cls(styles.h2),
    h3: cls(styles.h3),
    h4: cls(styles.h4),
    h5: cls(styles.h5),
    h6: cls(styles.h6),
  },
  quote: cls(styles.quote),
  list: {
    ul: cls(styles.list),
    ol: cls(styles.list),
    listitem: cls(styles.listItem),
    nested: { listitem: cls(styles.nestedListItem) },
    listitemChecked: cls(styles.listItemChecked),
    listitemUnchecked: cls(styles.listItemUnchecked),
  },
  link: cls(styles.link),
  text: {
    bold: cls(styles.bold),
    italic: cls(styles.italic),
    underline: cls(styles.underline),
    strikethrough: cls(styles.strikethrough),
    underlineStrikethrough: cls(styles.underlineStrikethrough),
    code: cls(styles.code),
    highlight: cls(styles.highlight),
  },
  code: cls(styles.codeBlock),
  table: cls(styles.table),
  tableCell: cls(styles.tableCell),
  tableCellHeader: cls(styles.tableCellHeader),
};
