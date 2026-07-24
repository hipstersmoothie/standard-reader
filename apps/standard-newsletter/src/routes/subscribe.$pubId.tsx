import { Alert } from "@standard-reader/design-system/alert";
import { Button } from "@standard-reader/design-system/button";
import { TextField } from "@standard-reader/design-system/text-field";
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
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { getPublicationSummary } from "../server/analytics";

export const Route = createFileRoute("/subscribe/$pubId")({
  loader: async ({ params }) => {
    const summary = await getPublicationSummary({
      data: { pubId: params.pubId },
    });
    if (!summary) throw redirect({ to: "/" });
    return summary;
  },
  component: Subscribe,
});

type Status = "idle" | "submitting" | "done" | "error";

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
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    // A single-column sign-up card; wider than this and the copy outruns a
    // comfortable line length.
    maxWidth: "440px",
    paddingBlockEnd: spacing["10"],
    paddingBlockStart: spacing["10"],
    paddingInlineEnd: spacing["9"],
    paddingInlineStart: spacing["9"],
    textAlign: "center",
    width: "100%",
  },
  // The tile carries the publication's own stored accent, which is arbitrary
  // runtime data rather than an app token.
  mark: (background: string, foreground: string) => ({
    backgroundColor: background,
    color: foreground,
  }),
  markBox: {
    alignItems: "center",
    borderRadius: radius.lg,
    display: "inline-flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    height: spacing["14"],
    justifyContent: "center",
    marginBottom: verticalSpace["4xl"],
    width: spacing["14"],
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
  desc: {
    color: uiColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: spacing["6"],
    marginBlockStart: 0,
  },
  /** Keeps the card's rhythm when a publication has no description. */
  descSpacer: {
    height: spacing["3"],
  },

  confirmation: {
    backgroundColor: primaryColor.component1,
    borderRadius: radius.lg,
    color: uiColor.text2,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    paddingInlineEnd: horizontalSpace["4xl"],
    paddingInlineStart: horizontalSpace["4xl"],
    textAlign: "start",
  },
  manageLink: {
    color: primaryColor.solid1,
    fontSize: fontSize.sm,
    marginTop: verticalSpace.xl,
  },
  mono: { fontFamily: fontFamily.mono },

  form: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xl,
    textAlign: "start",
  },
  // The publication's own accent is what a reader recognizes on this page, so
  // the primary action is painted in it rather than the app's.
  accentButton: (background: string, foreground: string) => ({
    backgroundColor: background,
    color: foreground,
  }),
  fineprint: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    marginBlockEnd: 0,
    marginBlockStart: verticalSpace.md,
    textAlign: "start",
  },

  divider: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xl,
    display: "flex",
    fontSize: fontSize.xs,
    marginBlockEnd: spacing["5"],
    marginBlockStart: spacing["5"],
    rowGap: gap.xl,
  },
  dividerRule: {
    backgroundColor: uiColor.border1,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    height: 1,
  },
  fullWidth: { width: "100%" },
});

function Subscribe() {
  const summary = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [showBluesky, setShowBluesky] = useState(false);
  const [handle, setHandle] = useState("");
  // Set when the Bluesky OAuth round-trip returns here.
  const [welcomed] = useState(() =>
    globalThis.location
      ? new URLSearchParams(globalThis.location.search).has("welcome")
      : false,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicationUri: summary.uri, email }),
      });
      const json = (await res.json()) as { ok?: boolean };
      setStatus(json.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  // Subscribe with Bluesky: hand off to the OAuth authorize route, carrying the
  // email + publication so the callback writes the subscriber's own record.
  const onBluesky = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      handle: handle.trim(),
      email: email.trim(),
      subscribe: summary.uri,
      redirect: `/subscribe/${summary.id}?welcome=1`,
    });
    globalThis.location.href = `/api/auth/atproto/authorize?${params.toString()}`;
  };

  const accent = summary.theme.accent;
  const onAccent = summary.theme.accentForeground;

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.card)}>
        <div
          {...stylex.props(styles.markBox, styles.mark(accent, onAccent))}
        >
          {summary.name.trim()[0]?.toUpperCase() ?? "•"}
        </div>
        <h1 {...stylex.props(styles.title)}>{summary.name}</h1>
        {summary.description ? (
          <p {...stylex.props(styles.desc)}>{summary.description}</p>
        ) : (
          <div {...stylex.props(styles.descSpacer)} />
        )}

        {welcomed ? (
          <div {...stylex.props(styles.confirmation)}>
            <strong>You’re subscribed.</strong> Your subscription is saved as a
            record in your own repo — new posts from {summary.name} will arrive
            by email. Unsubscribe anytime by deleting the record or using the
            link in any email.
            <div {...stylex.props(styles.manageLink)}>
              <a href="/subscribe/manage">Manage your subscriptions</a>
            </div>
          </div>
        ) : status === "done" ? (
          <div {...stylex.props(styles.confirmation)}>
            <strong>Almost there.</strong> We sent a confirmation link to{" "}
            <span {...stylex.props(styles.mono)}>{email}</span>. Click it to
            start receiving {summary.name} by email.
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
              <TextField
                aria-label="Email address"
                type="email"
                isRequired
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <Button
                type="submit"
                size="lg"
                isPending={status === "submitting"}
                style={[
                  styles.fullWidth,
                  styles.accentButton(accent, onAccent),
                ]}
              >
                Subscribe
              </Button>
              {status === "error" ? (
                <Alert variant="critical" title="That didn’t go through">
                  Please check the address and try again.
                </Alert>
              ) : null}
              <p {...stylex.props(styles.fineprint)}>
                Double opt-in — you’ll confirm from your inbox. Unsubscribe
                anytime.
              </p>
            </form>

            <div {...stylex.props(styles.divider)}>
              <span {...stylex.props(styles.dividerRule)} />
              or
              <span {...stylex.props(styles.dividerRule)} />
            </div>

            {showBluesky ? (
              <form onSubmit={onBluesky} {...stylex.props(styles.form)}>
                <TextField
                  aria-label="Bluesky handle"
                  isRequired
                  value={handle}
                  onChange={setHandle}
                  placeholder="your-handle.bsky.social"
                  autoComplete="username"
                  disablePasswordManagers
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  style={styles.fullWidth}
                >
                  Continue with Bluesky
                </Button>
                <p {...stylex.props(styles.fineprint)}>
                  We’ll save your subscription as a record in your own repo. Add
                  your email above first, then unsubscribe anytime by deleting
                  the record — or with the link in any email.
                </p>
              </form>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                onPress={() => setShowBluesky(true)}
                style={styles.fullWidth}
              >
                Subscribe with Bluesky
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
