"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { Link } from "@standard-reader/design-system/link";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { userinputApi } from "#/integrations/tanstack-query/api-userinput.functions";

const searchSchema = z.object({
  draft: z.string().min(1).optional(),
  upvote: z.string().min(1).optional(),
  // Outcome of a consumed draft/upvote, re-encoded onto a clean URL (see the
  // loader) so a second loader invocation (client-side revalidation after
  // SSR, back/forward navigation, etc.) re-renders the same result instead of
  // re-consuming already-deleted draft state.
  result: z.enum(["success", "upvoted", "expired", "error"]).optional(),
  uri: z.string().optional(),
  message: z.string().optional(),
  // OAuth callback appends these; we don't use them but accept them so the
  // route doesn't 400 on the post-callback URL.
  loginSuccess: z.union([z.string(), z.boolean()]).optional(),
  handle: z.string().optional(),
  avatar: z.string().optional(),
});

type ReturnOutcome =
  | { kind: "success"; uri: string }
  | { kind: "upvoted"; uri: string }
  | { kind: "expired" }
  | { kind: "error"; message: string };

/**
 * Both `feedback_draft` and `upvote_draft` rows are single-use — consuming
 * one atomically deletes it (see `consumeFeedbackDraft`/`consumeUpvoteDraft`).
 * A route loader isn't guaranteed to run exactly once for a given URL (the
 * client can revalidate after SSR hydration, navigate back/forward, etc.), so
 * consuming the draft directly in the loader and returning the outcome makes
 * a second invocation see the draft already gone and report `expired` —
 * clobbering the real result the reader already saw.
 *
 * Mirrors `/review/thanks`: process the one-time `draft`/`upvote` param once,
 * then `redirect` to a clean URL that carries only the display-safe outcome
 * (`result`/`uri`/`message`). Re-running the loader against that URL is a
 * pure read of search params — no server mutation, so it's safe to repeat.
 */
export const Route = createFileRoute("/_layout/feedback/return")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    draft: search.draft,
    upvote: search.upvote,
    result: search.result,
    uri: search.uri,
    message: search.message,
  }),
  loader: async ({ deps }): Promise<ReturnOutcome> => {
    // Upvote draft path: stashed before the OAuth round-trip when the reader
    // tried to upvote without the userinput upvote scope.
    if (deps.upvote) {
      try {
        const draft = await userinputApi.consumeUpvoteDraft({
          data: { draftId: deps.upvote },
        });
        if (!draft) {
          throw redirect({
            to: "/feedback/return",
            search: { result: "expired" },
          });
        }
        const result = await userinputApi.createUserinputUpvote({
          data: { subjectUri: draft.subjectUri },
        });
        throw redirect({
          to: "/feedback/return",
          search: { result: "upvoted", uri: result.uri },
        });
      } catch (error) {
        if (isRedirect(error)) throw error;
        throw redirect({
          to: "/feedback/return",
          search: {
            result: "error",
            message:
              error instanceof Error
                ? error.message
                : "Something went wrong while upvoting.",
          },
        });
      }
    }

    // Discussion draft path: stashed before the OAuth round-trip when the
    // reader submitted the feedback dialog without the discussion scope.
    if (deps.draft) {
      try {
        const draft = await userinputApi.consumeFeedbackDraft({
          data: { draftId: deps.draft },
        });
        if (!draft) {
          throw redirect({
            to: "/feedback/return",
            search: { result: "expired" },
          });
        }
        const result = await userinputApi.createUserinputDiscussion({
          data: {
            title: draft.title,
            ...(draft.body ? { body: draft.body } : {}),
            tag: draft.tag as "bug" | "feature" | "question",
            // Blob refs uploaded before the OAuth round trip — the bytes are
            // already on the reader's PDS, waiting to be claimed by this record.
            ...(draft.images?.length ? { images: draft.images } : {}),
          },
        });
        throw redirect({
          to: "/feedback/return",
          search: { result: "success", uri: result.uri },
        });
      } catch (error) {
        if (isRedirect(error)) throw error;
        throw redirect({
          to: "/feedback/return",
          search: {
            result: "error",
            message:
              error instanceof Error
                ? error.message
                : "Something went wrong while submitting your feedback.",
          },
        });
      }
    }

    switch (deps.result) {
      case "success": {
        return { kind: "success", uri: deps.uri ?? "" };
      }
      case "upvoted": {
        return { kind: "upvoted", uri: deps.uri ?? "" };
      }
      case "error": {
        return {
          kind: "error",
          message: deps.message ?? "Something went wrong.",
        };
      }
      default: {
        return { kind: "expired" };
      }
    }
  },
  head: () => ({
    meta: [{ title: "Thanks for your feedback · Standard Reader" }],
  }),
  component: FeedbackReturnPage,
});

const styles = stylex.create({
  page: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    paddingBottom: verticalSpace["5xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["5xl"],
  },
  panel: {
    boxSizing: "border-box",
    maxWidth: "32rem",
    paddingBottom: verticalSpace["4xl"],
    paddingInlineStart: horizontalSpace["4xl"],
    paddingInlineEnd: horizontalSpace["4xl"],
    paddingTop: verticalSpace["4xl"],
    width: {
      default: "100%",
      [breakpoints.sm]: "min(100%, 32rem)",
    },
  },
  title: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    marginBottom: 0,
    marginTop: 0,
  },
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: 1.5,
  },
});

function FeedbackReturnPage() {
  const outcome = Route.useLoaderData();

  if (outcome.kind === "success") {
    return (
      <main {...stylex.props(styles.page)}>
        <Flex direction="column" style={styles.panel}>
          <Flex direction="column" gap="xxs">
            <h1 {...stylex.props(styles.title)}>
              <Trans>Thank you.</Trans>
            </h1>
            <p {...stylex.props(styles.body)}>
              <Trans>
                Your feedback has been posted to{" "}
                <Link
                  href={`https://userinput.app/#/d/${encodeURIComponent(outcome.uri)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  userinput.app
                </Link>
                . Thanks for helping us improve Standard Reader.
              </Trans>
            </p>
          </Flex>
          <Flex>
            <Button
              variant="primary"
              onPress={() => (globalThis.location.href = "/feedback")}
            >
              <Trans>View feedback</Trans>
            </Button>
          </Flex>
        </Flex>
      </main>
    );
  }

  if (outcome.kind === "upvoted") {
    return (
      <main {...stylex.props(styles.page)}>
        <Flex direction="column" style={styles.panel}>
          <Flex direction="column" gap="xxs">
            <h1 {...stylex.props(styles.title)}>
              <Trans>Upvoted.</Trans>
            </h1>
            <p {...stylex.props(styles.body)}>
              <Trans>
                Your upvote has been recorded on userinput.app. Thanks for
                helping surface what matters.
              </Trans>
            </p>
          </Flex>
          <Flex>
            <Button
              variant="primary"
              onPress={() => (globalThis.location.href = "/feedback")}
            >
              <Trans>View feedback</Trans>
            </Button>
          </Flex>
        </Flex>
      </main>
    );
  }

  if (outcome.kind === "expired") {
    return (
      <main {...stylex.props(styles.page)}>
        <Flex direction="column" style={styles.panel}>
          <Flex direction="column" gap="xxs">
            <h1 {...stylex.props(styles.title)}>
              <Trans>That link expired.</Trans>
            </h1>
            <p {...stylex.props(styles.body)}>
              <Trans>
                The feedback draft wasn't found — it may have expired (drafts
                last 15 minutes) or you may have already submitted it. Try again
                any time.
              </Trans>
            </p>
          </Flex>
          <Flex>
            <Button
              variant="primary"
              onPress={() => (globalThis.location.href = "/feedback")}
            >
              <Trans>Back to feedback</Trans>
            </Button>
          </Flex>
        </Flex>
      </main>
    );
  }

  return (
    <main {...stylex.props(styles.page)}>
      <Flex direction="column" style={styles.panel}>
        <Flex direction="column" gap="xxs">
          <h1 {...stylex.props(styles.title)}>
            <Trans>Something went wrong.</Trans>
          </h1>
          <p {...stylex.props(styles.body)}>{outcome.message}</p>
        </Flex>
        <Flex>
          <Button
            variant="primary"
            onPress={() => (globalThis.location.href = "/feedback")}
          >
            <Trans>Back to feedback</Trans>
          </Button>
        </Flex>
      </Flex>
    </main>
  );
}
