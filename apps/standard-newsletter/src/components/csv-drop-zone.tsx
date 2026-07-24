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
import { useRef, useState } from "react";

import { common } from "../common-styles";
import { extractEmails } from "../lib/emails";
import { fmt } from "../lib/format";
import { I, Ico } from "./icons";

const styles = stylex.create({
  fileInput: { display: "none" },

  dropZone: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border2,
    borderRadius: radius.lg,
    borderStyle: "dashed",
    // 1.5px: a dashed hairline reads as a dotted line at 1px and as a box at
    // 2px, and the border scale has no half step.
    borderWidth: "1.5px",
    cursor: "pointer",
    paddingBlockEnd: verticalSpace["8xl"],
    paddingBlockStart: verticalSpace["8xl"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
    textAlign: "center",
  },
  dropZoneOver: {
    borderColor: primaryColor.solid1,
  },
  dropIcon: {
    marginBlockEnd: verticalSpace["2xl"],
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
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
  remove: {
    backgroundColor: "transparent",
    borderStyle: "none",
    borderWidth: 0,
    color: uiColor.text1,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: fontSize.sm,
    paddingBlockEnd: 0,
    paddingBlockStart: 0,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const ingest = async (file: File) => {
    const text = await file.text();
    onFile(file.name, extractEmails(text));
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        {...stylex.props(styles.fileInput)}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void ingest(file);
        }}
      />

      {emails.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void ingest(file);
          }}
          {...stylex.props(styles.dropZone, dragOver && styles.dropZoneOver)}
        >
          <div
            {...stylex.props(
              common.chip,
              styles.uploadChip,
              styles.dropIcon,
            )}
          >
            <Ico d={I.upload} s={22} />
          </div>
          <div {...stylex.props(styles.dropTitle)}>
            Drop a CSV here, or click to browse
          </div>
          <div {...stylex.props(styles.dropHint)}>
            One email per row. Name and signup date optional.
          </div>
        </div>
      ) : (
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
          <button
            type="button"
            onClick={onClear}
            {...stylex.props(styles.remove, common.flexNone)}
          >
            Remove
          </button>
        </div>
      )}
    </>
  );
}
