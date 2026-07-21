import { Flex } from "@standard-reader/design-system/flex";
import type { MarkpubRecord } from "@standard-reader/design-system/rich-text-editor";
import { RichTextEditor } from "@standard-reader/design-system/rich-text-editor";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { fontFamily, fontSize } from "@standard-reader/design-system/theme/typography.stylex";
import { Body, Heading1 } from "@standard-reader/design-system/typography";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    paddingBlock: verticalSpace["8xl"],
    paddingInline: horizontalSpace["3xl"],
  },
  shell: {
    marginInline: "auto",
    maxWidth: 820,
  },
  header: {
    marginBottom: verticalSpace["5xl"],
  },
  output: {
    marginTop: verticalSpace["5xl"],
  },
  outputLabel: {
    marginBottom: verticalSpace.md,
    color: uiColor.text1,
    fontSize: fontSize.sm,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  pre: {
    margin: 0,
    padding: verticalSpace.xl,
    backgroundColor: uiColor.component1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: uiColor.border2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  },
});

const STARTER = [
  "# Welcome to Standard Writer",
  "",
  "This is the shared **markpub** editor from `@standard-reader/design-system`.",
  "",
  "- Type Markdown shortcuts, or use the toolbar",
  "- Hover the left gutter for the **+** block menu",
  "- Everything serializes to `at.markpub.markdown`",
].join("\n");

export function App() {
  const [record, setRecord] = useState<MarkpubRecord | null>(null);

  return (
    <div {...stylex.props(styles.page)}>
      <Flex direction="column" style={styles.shell}>
        <div {...stylex.props(styles.header)}>
          <Heading1>Standard Writer</Heading1>
          <Body>
            A thin app around the shared design system and its Lexical-powered
            markpub editor.
          </Body>
        </div>

        <RichTextEditor
          defaultValue={STARTER}
          onChange={(next) => setRecord(next)}
          aria-label="Document body"
        />

        <div {...stylex.props(styles.output)}>
          <div {...stylex.props(styles.outputLabel)}>
            at.markpub.markdown output
          </div>
          <pre {...stylex.props(styles.pre)}>
            {record ? record.text.markdown : STARTER}
          </pre>
        </div>
      </Flex>
    </div>
  );
}
