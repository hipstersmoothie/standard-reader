"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { Link } from "@standard-reader/design-system/link";
import { Separator } from "@standard-reader/design-system/separator";
import { StarRatingInput } from "@standard-reader/design-system/star-rating";
import { TextArea } from "@standard-reader/design-system/text-area";
import {
  criticalColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { horizontalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import { Text } from "@standard-reader/design-system/typography/text";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { hasAtstoreReviewScope } from "../../integrations/auth/scope";
import { atstoreReviewApi } from "../../integrations/tanstack-query/api-atstore-review.functions";
import { user } from "../../integrations/tanstack-query/api-user.functions";
import { buildAuthRedirectPath } from "../../utils/auth-redirect";

const RETURNING_READER_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const shownPromptToastDids = new Set<string>();

const styles = stylex.create({
  trigger: { display: "none" },
  body: {
    width: "100%",
  },
  content: {
    width: "100%",
  },

  footerNote: {
    alignItems: "center",
    color: uiColor.text1,
    display: "flex",
    flexGrow: 1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    paddingInlineEnd: horizontalSpace.lg,
  },
  error: {
    color: criticalColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
});

function isReturningUser(createdAt: unknown): boolean {
  if (!createdAt) return false;
  const ms = new Date(createdAt as string | number | Date).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms >= RETURNING_READER_AGE_MS;
}

function currentReturnTo(): string {
  const url = new URL(globalThis.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function markPromptDismissedInCache(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.setQueryData(user.getSessionQueryOptions.queryKey, (current) => {
    if (!current) return current;
    return {
      ...current,
      atstoreReviewPromptDismissed: true,
    };
  });
}

async function dismissPromptBestEffort(args: {
  alreadyDismissed: boolean;
  dismiss: () => Promise<unknown>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  if (args.alreadyDismissed) return;
  try {
    await args.dismiss();
  } catch (error) {
    console.warn("Failed to dismiss ATStore review prompt:", error);
    markPromptDismissedInCache(args.queryClient);
  }
}

export function AtstoreReviewPrompt() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");

  const dismissPrompt = useMutation({
    mutationFn: async () => {
      await user.dismissAtstoreReviewPrompt();
    },
    onSuccess: () => {
      markPromptDismissedInCache(queryClient);
    },
  });

  const submitOrUpgrade = useMutation({
    mutationFn: async () => {
      const returnTo = currentReturnTo();
      const trimmedText = text.trim();
      const payload = {
        rating,
        ...(trimmedText ? { text: trimmedText } : {}),
      };

      if (rating < 1) {
        throw new Error(t`Please choose a rating.`);
      }

      await dismissPromptBestEffort({
        alreadyDismissed: session?.atstoreReviewPromptDismissed === true,
        dismiss: async () => dismissPrompt.mutateAsync(),
        queryClient,
      });

      if (hasAtstoreReviewScope(session?.grantedScope ?? null)) {
        await atstoreReviewApi.submitReview({ data: payload });
        return {
          authorizationUrl: null,
          thankYouPath: buildAuthRedirectPath("/review/thanks", { returnTo }),
          directSubmit: true,
        };
      }

      const redirect = atstoreReviewApi.buildReviewCompletionPath({
        rating,
        ...(trimmedText ? { text: trimmedText } : {}),
        returnTo,
      });
      const result = await atstoreReviewApi.requestReviewPermissions({
        data: { redirect },
      });
      return {
        authorizationUrl: result.authorizationUrl,
        thankYouPath: redirect,
        directSubmit: false,
      };
    },
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        globalThis.location.href = result.authorizationUrl;
        return;
      }
      setOpen(false);
      setRating(0);
      setText("");
      globalThis.location.href = result.thankYouPath;
    },
  });

  useEffect(() => {
    const did = session?.user?.did;
    if (!did) return;
    if (shownPromptToastDids.has(did)) return;
    if (session.atstoreReviewPromptDismissed === true) return;
    if (!isReturningUser(session.user.createdAt)) return;

    shownPromptToastDids.add(did);
    toasts.add(
      {
        title: t`Do you like Standard Reader?`,
        description: t`Leave us a review on ATStore.`,
        action: {
          label: t`Review`,
          variant: "primary",
          onPress: () => {
            void dismissPromptBestEffort({
              alreadyDismissed: session.atstoreReviewPromptDismissed === true,
              dismiss: async () => dismissPrompt.mutateAsync(),
              queryClient,
            }).finally(() => {
              setOpen(true);
            });
          },
        },
        onClose: () => {
          void dismissPromptBestEffort({
            alreadyDismissed: session.atstoreReviewPromptDismissed === true,
            dismiss: async () => dismissPrompt.mutateAsync(),
            queryClient,
          });
        },
      },
      { timeout: 15_000 },
    );
  }, [dismissPrompt, queryClient, session, t]);

  const footerCopy = hasAtstoreReviewScope(session?.grantedScope ?? null)
    ? t`Create will publish your review to ATStore.`
    : t`Clicking Create will first request permissions to create a review.`;

  const error = submitOrUpgrade.error;

  return (
    <>
      <Dialog
        isOpen={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            submitOrUpgrade.reset();
          }
        }}
        size="md"
        fitContent
        trigger={<span hidden aria-hidden {...stylex.props(styles.trigger)} />}
      >
        <DialogHeader>
          <Trans>Leave a review</Trans>
        </DialogHeader>
        <DialogDescription>
          <Trans>
            Sharing a review on the{" "}
            <Link
              href="https://atstore.fyi/products/standard-reader"
              target="_blank"
              rel="noopener noreferrer"
            >
              ATStore
            </Link>{" "}
            will help both us and other users see what you think about Standard
            Reader.
          </Trans>
        </DialogDescription>
        <Separator />
        <DialogBody style={styles.body}>
          <Flex direction="column" gap="3xl" style={styles.content}>
            <Flex align="center" gap="md">
              <Text weight="semibold">
                <Trans>Rating</Trans>
              </Text>
              <StarRatingInput
                aria-label={t`Rating`}
                value={rating}
                onChange={setRating}
                size={24}
              />
            </Flex>

            <TextArea
              aria-label={t`Review`}
              placeholder={t`Optional: tell people what you like about Standard Reader`}
              value={text}
              onChange={setText}
              rows={5}
              autosize={false}
            />

            {error ? (
              <span {...stylex.props(styles.error)}>
                {error instanceof Error
                  ? error.message
                  : t`Something went wrong while preparing your review.`}
              </span>
            ) : null}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <span {...stylex.props(styles.footerNote)}>{footerCopy}</span>
          <Button
            variant="primary"
            isDisabled={rating < 1}
            isPending={submitOrUpgrade.isPending}
            onPress={() => submitOrUpgrade.mutate()}
          >
            <Trans>Create</Trans>
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
