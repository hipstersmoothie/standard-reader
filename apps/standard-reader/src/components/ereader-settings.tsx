"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { CopyToClipboardButton } from "@standard-reader/design-system/copy-to-clipboard-button";
import { Separator } from "@standard-reader/design-system/separator";
import { TextField } from "@standard-reader/design-system/text-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";

import { ereaderApi } from "#/integrations/tanstack-query/api-ereader.functions";

import { settingRowStyles } from "./settings-row-styles";

const MOBILE = "@media (max-width: 47.5rem)";

/**
 * These rows are not `SettingRow`s.
 *
 * Same two-column geometry — label and description at the start, the control at
 * the end — but that row sizes its control column to its content, which is right
 * for a switch and wrong for a text field: it collapses to a sliver and the
 * reader cannot see what they are copying. Here the value column gets the width.
 *
 * The field itself is the design system's `TextField`, so it looks like every
 * other input in the app and the sync key gets a reveal toggle for free.
 */
const styles = stylex.create({
  block: {
    display: "flex",
    flexDirection: "column",
    gap: gap.md,
    paddingBottom: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  intro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.base,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "72ch",
  },
  row: {
    alignItems: { [MOBILE]: "stretch", default: "center" },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: { [MOBILE]: "column", default: "row" },
    justifyContent: "space-between",
    paddingBottom: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    rowGap: gap.lg,
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  value: {
    flexGrow: 0,
    flexShrink: 1,
    // Off the spacing scale on purpose: a text column is sized so its content
    // reads, not to a spacing step. Wide enough for a handle or a host; a long
    // URL scrolls inside the field rather than stretching the row to fit it.
    width: { [MOBILE]: "100%", default: "20rem" },
  },
});

interface ConnectionField {
  label: string;
  description: string;
  value: string;
  /** Masked until the reader asks to see it — the sync key. */
  secret?: boolean;
}

/**
 * Connecting an e-reader.
 *
 * Two independent things, in the order a reader does them: the catalog their
 * device browses, and the sync that carries their place between devices.
 * Everything here is a value to copy — there is nothing to toggle, because
 * there is nothing about this the app decides on their behalf.
 */
export function EreaderSettings() {
  const { t } = useLingui();
  const { data: connection } = useQuery(
    ereaderApi.getEreaderConnectionQueryOptions(),
  );

  if (!connection) return null;

  const fields: Array<ConnectionField> = [
    {
      description: t`Your shelves, as an OPDS catalog. Anyone with this URL can see the same public records your profile already shows.`,
      label: t`Catalog URL`,
      value: connection.catalogUrl,
    },
    {
      description: t`In KOReader: Tools → Progress sync → Custom sync server.`,
      label: t`Sync server`,
      value: connection.kosyncUrl,
    },
    {
      description: t`Log in with this as your username — there is no separate sync account.`,
      label: t`Sync username`,
      value: connection.username,
    },
    {
      description: t`Use this as the password. It only carries your reading position between devices — it cannot read or change anything else.`,
      label: t`Sync key`,
      secret: true,
      value: connection.syncKey,
    },
  ];

  return (
    <>
      <div {...stylex.props(styles.block)}>
        <p {...stylex.props(styles.intro)}>
          <Trans>
            Add your catalog to KOReader, Foliate, Marvin, Panels or any other
            OPDS app and your unread queue, saved articles, subscriptions and
            lists show up on the device — each one downloadable as an EPUB.
          </Trans>
        </p>
      </div>

      {fields.map((field) => (
        <Fragment key={field.label}>
          <Separator />
          <div {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.text)}>
              <p {...stylex.props(settingRowStyles.label)}>{field.label}</p>
              <p {...stylex.props(settingRowStyles.description)}>
                {field.description}
              </p>
            </div>
            {/* The row already carries the label and description, so the field
                takes neither — printing them twice is what a `label` prop here
                would do. */}
            <TextField
              isReadOnly
              aria-label={field.label}
              disablePasswordManagers
              size="md"
              style={styles.value}
              suffix={<CopyToClipboardButton size="sm" text={field.value} />}
              type={field.secret ? "password" : "text"}
              value={field.value}
            />
          </div>
        </Fragment>
      ))}
    </>
  );
}
