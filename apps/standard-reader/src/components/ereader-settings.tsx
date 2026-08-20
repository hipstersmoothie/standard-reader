"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { CopyToClipboardButton } from "@standard-reader/design-system/copy-to-clipboard-button";
import { Separator } from "@standard-reader/design-system/separator";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
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
import { Fragment, useState } from "react";

import { ereaderApi } from "#/integrations/tanstack-query/api-ereader.functions";

import { settingRowStyles } from "./settings-row-styles";

const MOBILE = "@media (max-width: 47.5rem)";

/**
 * These rows are not `SettingRow`s.
 *
 * Same two-column geometry — label and description at the start, the control at
 * the end — but that row sizes its control column to its content, which is right
 * for a switch and wrong for a URL: the field collapses to a sliver and the
 * reader cannot see what they are copying. Here the value column is the one that
 * grows.
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
  field: {
    backgroundColor: uiColor.component2,
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: uiColor.text1,
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    // Without this a flex item refuses to shrink below its content width, and
    // a long URL pushes the copy button off the end of the card.
    minWidth: 0,
    paddingBottom: verticalSpace.sm,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    paddingTop: verticalSpace.sm,
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
  value: {
    alignItems: "center",
    display: "flex",
    // Off the spacing scale on purpose: this is a text column, sized so a URL
    // is readable rather than to any spacing step. It still shrinks — the
    // field truncates before the copy button is pushed off the card.
    flexBasis: "26rem",
    flexGrow: 1,
    flexShrink: 1,
    gap: gap.sm,
    minWidth: 0,
    width: { [MOBILE]: "100%", default: "auto" },
  },
});

interface ConnectionField {
  label: string;
  description: string;
  value: string;
  /** Hide the value until the reader asks for it — the sync key. */
  masked?: boolean;
}

function CopyField({ label, value, masked = false }: ConnectionField) {
  const [revealed, setRevealed] = useState(false);
  const shown = masked && !revealed ? "•".repeat(value.length) : value;

  return (
    <div {...stylex.props(styles.value)}>
      <input
        readOnly
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        value={shown}
        {...stylex.props(styles.field)}
      />
      {masked ? (
        <Button
          onPress={() => setRevealed((previous) => !previous)}
          size="sm"
          variant="secondary"
        >
          {revealed ? <Trans>Hide</Trans> : <Trans>Show</Trans>}
        </Button>
      ) : null}
      {/* Copy works whether or not the value is on screen — a reader moving a
          key to a device should not have to look at it. */}
      <CopyToClipboardButton size="md" text={value} />
    </div>
  );
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
      masked: true,
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
            <CopyField {...field} />
          </div>
        </Fragment>
      ))}
    </>
  );
}
