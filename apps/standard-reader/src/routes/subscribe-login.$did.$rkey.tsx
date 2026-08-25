import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { Form } from "@standard-reader/design-system/form";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap as gapSpace,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { Body } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { publicationUriFromParams } from "#/components/reader/format";
import { publicationThemeScaleVars } from "#/components/reader/publication-theme-scale";
import {
  publicationPrimary,
  publicationUi,
} from "#/components/reader/publication-theme-tokens";
import { UserHandleAutocomplete } from "#/components/user-handle-autocomplete";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { unauthMiddleware } from "#/middleware/auth";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

const styles = stylex.create({
  shell: {
    margin: 0,
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    minHeight: "100vh",
    paddingBottom: verticalSpace["4xl"],
    paddingTop: verticalSpace["3xl"],
    width: "100%",
  },
  card: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    gap: gapSpace["2xl"],
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    color: uiColor.text2,
    display: "flex",
    flexDirection: "column",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    width: {
      default: "100%",
      [breakpoints.sm]: "min(80vw, 420px)",
    },
  },
  header: {
    gap: gapSpace.xl,
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    margin: 0,
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textAlign: "center",
  },
  dek: {
    margin: 0,
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    textAlign: "center",
    maxWidth: "34ch",
  },
  form: {
    gap: gapSpace.md,
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  avatar: {
    borderColor: primaryColor.border1,
    borderWidth: 2,
    flexShrink: 0,
    height: sizeSpace["5xl"],
    width: sizeSpace["5xl"],
  },
  legalLine: {
    margin: 0,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    textAlign: "center",
    paddingBottom: verticalSpace["2xl"],
    paddingTop: verticalSpace.xs,
  },
  legalLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: uiColor.text1,
    textDecorationColor: "currentColor",
  },
});

export const Route = createFileRoute("/subscribe-login/$did/$rkey")({
  server: {
    middleware: [unauthMiddleware],
  },
  loader: async ({ context, params }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const meta = await context.queryClient.ensureQueryData(
      publicationApi.getPublicationEmbedMetaQueryOptions(uri),
    );
    if (!meta) {
      throw notFound();
    }
    return { meta, publicationUri: uri };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    const name = meta?.name;
    return {
      meta: [
        { title: name ? `Subscribe to ${name}` : "Subscribe" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SubscribeLoginPage,
});

function SubscribeLoginPage() {
  const { t } = useLingui();
  const { meta } = Route.useLoaderData();
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [inputValue, setInputValue] = useState("");

  const scaleVars = publicationThemeScaleVars(meta);
  const redirect = buildAuthRedirectPath(`/subscribe/${meta.did}/${meta.rkey}`);

  const loginMutation = useMutation({
    mutationFn: async (selectedHandle: string) => {
      await navigate({
        to: "/api/auth/atproto/authorize",
        search: {
          handle: selectedHandle,
          redirect,
          intent: "subscribe",
        },
      });
    },
  });

  /** Sign in with whatever is typed. Shared by the button and Enter-to-submit. */
  const submitTypedHandle = () => {
    if (loginMutation.isPending) return;
    const trimmed = handle.trim().replace(/^@/, "");
    if (trimmed === "") return;
    loginMutation.mutate(trimmed);
  };

  const avatarUrl = meta.iconUrl ?? meta.ownerAvatarUrl ?? undefined;
  const publicationName = meta.name;

  return (
    <main
      {...stylex.props(styles.shell, publicationUi, publicationPrimary)}
      style={scaleVars}
    >
      <Form
        style={styles.card}
        // The handle field is the form's only input, so the browser submits
        // implicitly on Enter. Without this, that native GET submit reloads the
        // page and wipes the typed handle instead of signing in.
        onSubmit={(event) => {
          event.preventDefault();
          submitTypedHandle();
        }}
      >
        <Flex direction="column" align="center" gap="xl" style={styles.header}>
          <Avatar
            src={avatarUrl}
            alt={meta.name}
            fallback={meta.name[0]?.toUpperCase() ?? "?"}
            size="xl"
            style={styles.avatar}
          />
          <Text style={styles.title}>
            <Trans>Subscribe to {publicationName}</Trans>
          </Text>
          <Body style={styles.dek}>
            <Trans>Sign in with your Atmosphere account.</Trans>
          </Body>
        </Flex>

        <Flex direction="column" gap="md" style={styles.form}>
          <UserHandleAutocomplete
            size="lg"
            placeholder="your.handle.com"
            aria-label={t`Atmosphere account`}
            value={inputValue}
            onValueChange={(value) => {
              setInputValue(value);
              setHandle(value);
            }}
            onSelect={(selectedHandle) => {
              const trimmed = selectedHandle.trim().replace(/^@/, "");
              if (trimmed === "") return;
              setInputValue(trimmed);
              setHandle(trimmed);
              loginMutation.mutate(trimmed);
            }}
          />
          <Button
            size="lg"
            type="button"
            isDisabled={!handle.trim() || loginMutation.isPending}
            isPending={loginMutation.isPending}
            onPress={submitTypedHandle}
          >
            <Trans>Subscribe</Trans>
          </Button>
        </Flex>
      </Form>
      <p {...stylex.props(styles.legalLine)}>
        <Trans>
          Powered by{" "}
          <a href={getPublicUrlClient()} {...stylex.props(styles.legalLink)}>
            Standard Reader
          </a>
        </Trans>
      </p>
    </main>
  );
}
