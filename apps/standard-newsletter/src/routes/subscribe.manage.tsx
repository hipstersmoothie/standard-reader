import { Button } from "@standard-reader/design-system/button";
import { Link } from "@standard-reader/design-system/link";
import {
  primaryColor,
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
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { useState } from "react";

import { common } from "../common-styles";
import type { MySubscription } from "../server/subscriptions.server";

const getMySubscriptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; subs: Array<MySubscription> }> => {
    const { getCurrentUserDid } =
      await import("../integrations/auth/session.server");
    const did = await getCurrentUserDid(getRequest());
    if (!did) return { signedIn: false, subs: [] };
    const { loadMySubscriptions } =
      await import("../server/subscriptions.server");
    return { signedIn: true, subs: await loadMySubscriptions(did) };
  },
);

export const Route = createFileRoute("/subscribe/manage")({
  loader: () => getMySubscriptions(),
  component: Manage,
});

const styles = stylex.create({
  page: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily.sans,
    justifyContent: "center",
    minHeight: stylex.firstThatWorks("100dvh", "100vh"),
    paddingBlockEnd: spacing["6"],
    paddingBlockStart: spacing["6"],
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
  },
  card: {
    // A list of subscription rows; wider than a sign-up card, still one column.
    maxWidth: "520px",
    paddingBlockEnd: spacing["9"],
    paddingBlockStart: spacing["9"],
    paddingInlineEnd: spacing["8"],
    paddingInlineStart: spacing["8"],
    width: "100%",
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginBlockEnd: verticalSpace.sm,
    marginBlockStart: 0,
  },
  intro: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: spacing["6"],
    marginBlockStart: 0,
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  noteLink: {
    color: primaryColor.text1,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.lg,
  },
  row: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: gap.xl,
    display: "flex",
    paddingBlockEnd: verticalSpace["2xl"],
    paddingBlockStart: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.xl,
  },
  rowName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
  },
});

function Manage() {
  const initial = Route.useLoaderData() as {
    signedIn: boolean;
    subs: Array<MySubscription>;
  };
  const [subs, setSubs] = useState<Array<MySubscription>>(initial.subs);
  const [busy, setBusy] = useState<string | null>(null);

  const unsubscribe = async (publicationUri: string) => {
    setBusy(publicationUri);
    try {
      const res = await fetch("/api/subscription/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationUri }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (json.ok) {
        setSubs((prev) =>
          prev.filter((s) => s.publicationUri !== publicationUri),
        );
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(common.card, styles.card)}>
        <h1 {...stylex.props(styles.title)}>Your subscriptions</h1>
        <p {...stylex.props(styles.intro)}>
          Subscriptions you made with Bluesky are records in your own repo.
          Unsubscribing deletes the record.
        </p>

        {initial.signedIn ? null : (
          <p {...stylex.props(styles.note)}>
            <Link href="/login" style={styles.noteLink}>
              Sign in with Bluesky
            </Link>{" "}
            to manage your subscriptions.
          </p>
        )}
        {initial.signedIn && subs.length === 0 ? (
          <p {...stylex.props(styles.note)}>
            You have no Bluesky subscriptions. Ones you made with just an email
            are managed from the unsubscribe link in any email.
          </p>
        ) : null}
        {initial.signedIn && subs.length > 0 ? (
          <div {...stylex.props(styles.list)}>
            {subs.map((sub) => (
              <div key={sub.publicationUri} {...stylex.props(styles.row)}>
                <span
                  {...stylex.props(
                    common.flexFill,
                    styles.rowName,
                    common.truncate,
                  )}
                >
                  {sub.publicationName}
                </span>
                <Button
                  variant="tertiary"
                  size="sm"
                  isPending={busy === sub.publicationUri}
                  onPress={() => unsubscribe(sub.publicationUri)}
                >
                  Unsubscribe
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
