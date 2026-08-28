import { Button } from "@standard-reader/design-system/button";
import {
  FileDropDefaultTrigger,
  FileDropZone,
} from "@standard-reader/design-system/file-drop-zone";
import {
  primaryColor,
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import { common } from "../common-styles";
import { extractEmails } from "../lib/emails";
import { fmt } from "../lib/format";
import { I, Ico } from "./icons";

const styles = stylex.create({
  dropZone: {
    // The zone sits on the page ground, so it is a raised surface rather than
    // the design system's default recessed one — but it keeps the token the
    // drop-target state switches to, so the drag feedback still reads.
    backgroundColor: {
      default: uiColor.bg,
      ":is([data-drop-target])": primaryColor.component1,
    },
    paddingBlockEnd: verticalSpace["8xl"],
    paddingBlockStart: verticalSpace["8xl"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
    textAlign: "center",
    width: "100%",
  },
  dropIcon: {
    marginBlockEnd: verticalSpace["2xl"],
  },
  dropTitle: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: verticalSpace.xs,
  },
  dropHint: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },

  chosen: {
    alignItems: "center",
    borderRadius: radius.md,
    columnGap: gap["3xl"],
    display: "flex",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap["3xl"],
  },
  chosenName: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  chosenCount: {
    alignItems: "center",
    color: successColor.text1,
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.sm,
    marginTop: verticalSpace.xxs,
    rowGap: gap.sm,
  },
  // The file chip's icon tile sits between the `chip` sizes; 40px keeps it in
  // proportion with the 19px glyph inside it.
  fileChip: { height: spacing["10"], width: spacing["10"] },
  uploadChip: { height: spacing["12"], width: spacing["12"] },
});

/**
 * The subscriber-CSV upload widget shared by the create-newsletter wizard and
 * the per-publication import page: a drag-and-drop / click-to-browse target that
 * flips to a file chip once addresses are parsed. Parsing is client-side and
 * tolerant (see `extractEmails`); the parent owns the resulting `emails`.
 *
 * The target is the design system's `FileDropZone`, so the drop, the file
 * picker, and the keyboard path are react-aria's rather than a `role="button"`
 * div with hand-written drag handlers.
 */
export function CsvDropZone({
  emails,
  fileName,
  onFile,
  onClear,
}: {
  emails: Array<string>;
  fileName: string | null;
  onFile: (name: string, emails: Array<string>) => void;
  onClear: () => void;
}) {
  const ingest = (file: File) => {
    void file.text().then((text) => {
      onFile(file.name, extractEmails(text));
    });
  };

  if (emails.length > 0) {
    return (
      <div {...stylex.props(common.card, styles.chosen)}>
        <div {...stylex.props(common.chip, styles.fileChip)}>
          <Ico d={I.file} s={19} />
        </div>
        <div {...stylex.props(common.flexFill)}>
          <div {...stylex.props(styles.chosenName)}>{fileName}</div>
          <div {...stylex.props(styles.chosenCount)}>
            <Ico d={I.check} s={14} w={2.4} />
            {fmt(emails.length)} valid{" "}
            {emails.length === 1 ? "address" : "addresses"} ready to import
          </div>
        </div>
        <Button variant="tertiary" size="sm" onPress={onClear}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <FileDropZone
      // Exports from other tools are `.csv`, but plenty are saved as plain text
      // or arrive with no type at all, and `extractEmails` reads any of them.
      acceptedFileTypes={["text/csv", "text/plain", ".csv"]}
      onAddFiles={(files) => {
        if (files[0]) ingest(files[0]);
      }}
      style={styles.dropZone}
    >
      <div {...stylex.props(common.chip, styles.uploadChip, styles.dropIcon)}>
        <Ico d={I.upload} s={22} />
      </div>
      <div {...stylex.props(styles.dropTitle)}>
        Drop a CSV here, or click to browse
      </div>
      <div {...stylex.props(styles.dropHint)}>
        One email per row. Name and signup date optional.
      </div>
      <FileDropDefaultTrigger>Choose a CSV file</FileDropDefaultTrigger>
    </FileDropZone>
  );
}
