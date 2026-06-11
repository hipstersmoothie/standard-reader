"use client";

import type { PublicationSocialProof } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";
import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { Fragment, useState } from "react";

import { Avatar } from "../../design-system/avatar";
import { Dialog, DialogBody, DialogHeader } from "../../design-system/dialog";
import { Flex } from "../../design-system/flex";
import { uiColor } from "../../design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import { initials } from "./format";

const SOCIAL_PROOF_NAMES = 2;

const styles = stylex.create({
  line: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["3"],
  },
  link: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  othersButton: {
    borderStyle: "none",
    textDecoration: { default: "underline", ":hover": "none" },
    backgroundColor: "transparent",
    color: uiColor.text2,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    textUnderlineOffset: "2px",
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["0"],
  },
  modalBody: {
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxHeight: "56vh",
    overflowY: "auto",
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["0"],
  },
  readerRow: {
    textDecoration: { default: "none", ":hover": "none" },
    alignItems: "center",
    color: "inherit",
    columnGap: gap["md"],
    display: "flex",
    rowGap: gap["md"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3.5"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: spacing["3.5"],
  },
  readerRowLast: {
    borderBottomStyle: "none",
  },
  readerMeta: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  readerName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  readerHandle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
});

type SocialProofReader = PublicationSocialProof["readers"][number];

function coReaderLabel(reader: SocialProofReader): string {
  if (reader.handle) return `@${reader.handle}`;
  if (reader.displayName) return reader.displayName;
  return "A reader";
}

function readerDisplayName(reader: SocialProofReader): string {
  return reader.displayName ?? (reader.handle ? `@${reader.handle}` : "Reader");
}

function ReaderLink({
  reader,
  isLast,
}: {
  reader: SocialProofReader;
  isLast?: boolean;
}) {
  const label = readerDisplayName(reader);

  const content = (
    <>
      <Avatar
        src={reader.avatarUrl ?? undefined}
        alt={label}
        size="md"
        fallback={initials(label)}
      />
      <Flex direction="column" gap="xs" style={styles.readerMeta}>
        <span {...stylex.props(styles.readerName)}>{label}</span>
        {reader.handle ? (
          <span {...stylex.props(styles.readerHandle)}>@{reader.handle}</span>
        ) : null}
      </Flex>
    </>
  );

  return (
    <AuthorProfileLink
      authorRef={reader.did}
      linkStyle={[styles.readerRow, isLast && styles.readerRowLast]}
    >
      {content}
    </AuthorProfileLink>
  );
}

export function PublicationSocialProofLine({
  readers,
  total,
}: PublicationSocialProof) {
  const [open, setOpen] = useState(false);

  if (total === 0) return null;

  const shown = readers.slice(0, SOCIAL_PROOF_NAMES);
  const others = total - shown.length;
  const modalReaders = readers.length > 0 ? readers : shown;

  return (
    <>
      <div {...stylex.props(styles.line)}>
        Followed by{" "}
        {shown.map((reader, index) => (
          <Fragment key={reader.did}>
            {index > 0
              ? others === 0 && index === shown.length - 1
                ? " and "
                : ", "
              : null}
            {reader.handle ? (
              <AuthorProfileLink authorRef={reader.did} linkStyle={styles.link}>
                @{reader.handle}
              </AuthorProfileLink>
            ) : (
              <AuthorProfileLink authorRef={reader.did} linkStyle={styles.link}>
                {coReaderLabel(reader)}
              </AuthorProfileLink>
            )}
          </Fragment>
        ))}
        {others > 0 ? (
          <>
            {shown.length > 0 ? " and " : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              {...stylex.props(styles.othersButton)}
            >
              {others} {others === 1 ? "other" : "others"}
            </button>
          </>
        ) : null}
      </div>
      {others > 0 ? (
        <Dialog
          isOpen={open}
          onOpenChange={setOpen}
          size="sm"
          fitContent
          trigger={<span hidden aria-hidden />}
        >
          <DialogHeader>
            Followed by {total} {total === 1 ? "reader" : "readers"} you follow
          </DialogHeader>
          <DialogBody style={styles.modalBody}>
            {modalReaders.map((reader, index) => (
              <ReaderLink
                key={reader.did}
                reader={reader}
                isLast={index === modalReaders.length - 1}
              />
            ))}
          </DialogBody>
        </Dialog>
      ) : null}
    </>
  );
}
