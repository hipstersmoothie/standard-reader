"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  primary,
  ui,
} from "@standard-reader/design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontSize,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { Body, Heading1 } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, PenLine } from "lucide-react";
import { useEffect } from "react";

import type { McpAuthorizeSearch } from "#/integrations/tanstack-query/api-mcp.functions";
import {
  mcpApi,
  mcpAuthorizeSearchSchema,
} from "#/integrations/tanstack-query/api-mcp.functions";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { BrandWordmark } from "../../components/reader/brand-wordmark";
import { SiteLegalLinks } from "../../components/site-legal-links";

const styles = stylex.create({
  main: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100dvh",
  },
  container: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    paddingBlock: verticalSpace["8xl"],
    paddingInline: horizontalSpace["4xl"],
  },
  // The consent column is a reading measure, not a spacing step: it is sized to
  // hold two short lines of scope copy without wrapping awkwardly. `/login`
  // sizes its form the same way.
  column: {
    maxWidth: "27rem",
    width: "100%",
  },
  wordmark: {
    paddingBottom: verticalSpace["5xl"],
    textAlign: "center",
  },
  card: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    paddingBlock: {
      default: verticalSpace["5xl"],
      [breakpoints.sm]: verticalSpace["6xl"],
    },
    paddingInline: {
      default: horizontalSpace["4xl"],
      [breakpoints.sm]: horizontalSpace["5xl"],
    },
  },
  question: {
    fontSize: fontSize["2xl"],
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginBlock: verticalSpace.none,
    textWrap: "balance",
  },
  // Two facts a reader can actually check: who they are, and where the code
  // goes. Kept as a definition list so the pairing is real, not just visual.
  facts: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    columnGap: horizontalSpace["3xl"],
    rowGap: verticalSpace["2xl"],
    margin: verticalSpace.none,
  },
  factTerm: {
    margin: verticalSpace.none,
  },
  factValue: {
    display: "flex",
    alignItems: "center",
    gap: horizontalSpace.md,
    margin: verticalSpace.none,
    minWidth: 0,
  },
  factText: {
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  scopeList: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: verticalSpace.none,
    padding: verticalSpace.none,
  },
  scopeItem: {
    alignItems: "start",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: horizontalSpace["2xl"],
    paddingBlock: verticalSpace["3xl"],
  },
  scopeItemLast: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  scopeIcon: {
    color: uiColor.text1,
    flexShrink: 0,
    height: sizeSpace.md,
    marginTop: verticalSpace.xxs,
    width: sizeSpace.md,
  },
  actions: {
    display: "flex",
    flexDirection: {
      default: "column-reverse",
      [breakpoints.sm]: "row",
    },
    gap: horizontalSpace["2xl"],
  },
  actionButton: {
    flexGrow: 1,
    justifyContent: "center",
  },
  legal: {
    paddingBottom: verticalSpace["5xl"],
    paddingInline: horizontalSpace["4xl"],
  },
});

export const Route = createFileRoute("/mcp/authorize")({
  validateSearch: mcpAuthorizeSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => mcpApi.checkAuthorization({ data: deps.search }),
  component: AuthorizePage,
});

function currentSearchPath(search: McpAuthorizeSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  return `/mcp/authorize?${params.toString()}`;
}

/**
 * Standing page shared by every state of the flow — a sibling of `/login`,
 * which is the screen immediately before this one.
 */
function AuthorizeShell({ children }: { children: React.ReactNode }) {
  return (
    <main {...stylex.props(styles.main, primary.bgSubtle)}>
      <div {...stylex.props(styles.container)}>
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(styles.wordmark)}>
            <BrandWordmark />
          </div>
          <div {...stylex.props(styles.card, ui.bg, ui.borderDim)}>
            {children}
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.legal)}>
        <SiteLegalLinks />
      </div>
    </main>
  );
}

function AuthorizePage() {
  const view = Route.useLoaderData();
  const search = Route.useSearch();
  const { t } = useLingui();

  // A protocol-level problem (bad response_type, unsupported scope) is the
  // client's to handle, so bounce straight back to it rather than showing the
  // reader an error they can do nothing about.
  useEffect(() => {
    if (view.status === "redirect") {
      globalThis.location.href = view.url;
    }
  }, [view]);

  const approve = useMutation({
    mutationFn: () => mcpApi.approve({ data: search }),
    onSuccess: ({ url }) => {
      globalThis.location.href = url;
    },
  });

  const deny = useMutation({
    mutationFn: () => mcpApi.deny({ data: search }),
    onSuccess: ({ url }) => {
      if (url) globalThis.location.href = url;
    },
  });

  if (view.status === "redirect") {
    return (
      <AuthorizeShell>
        <Flex direction="column" gap="lg">
          <Heading1 style={styles.question}>
            <Trans>Taking you back…</Trans>
          </Heading1>
          <Body variant="secondary">
            <Trans>
              This request can&apos;t be completed here, so we&apos;re returning
              you to the app that sent you.
            </Trans>
          </Body>
        </Flex>
      </AuthorizeShell>
    );
  }

  if (view.status === "error") {
    const needsSignIn = view.code === "login_required";
    const signInHref = `/login?redirect=${encodeURIComponent(
      buildAuthRedirectPath(currentSearchPath(search)),
    )}`;
    return (
      <AuthorizeShell>
        <Flex direction="column" gap="4xl">
          <Flex direction="column" gap="lg">
            <Heading1 style={styles.question}>
              {needsSignIn ? (
                <Trans>Sign in to continue</Trans>
              ) : (
                <Trans>This app can&apos;t be connected</Trans>
              )}
            </Heading1>
            <Body variant="secondary">{view.message}</Body>
          </Flex>
          {needsSignIn ? (
            <Button
              variant="primary"
              size="lg"
              style={styles.actionButton}
              onPress={() => {
                globalThis.location.href = signInHref;
              }}
            >
              <Trans>Sign in to Standard Reader</Trans>
            </Button>
          ) : (
            <Body variant="secondary">
              <Trans>
                Nothing has been shared. Head back to the app you came from and
                try connecting again.
              </Trans>
            </Body>
          )}
        </Flex>
      </AuthorizeShell>
    );
  }

  const busy = approve.isPending || deny.isPending;
  const canWrite = view.scopes.includes("mcp:write");
  const scopeCopy: Array<{
    key: string;
    icon: typeof BookOpen;
    title: string;
    detail: string;
  }> = [];
  if (view.scopes.includes("mcp:read")) {
    scopeCopy.push({
      key: "mcp:read",
      icon: BookOpen,
      title: t`Read your library`,
      detail: t`Your saved articles, reading history, likes, subscriptions and lists — plus anything already public on the network.`,
    });
  }
  if (canWrite) {
    scopeCopy.push({
      key: "mcp:write",
      icon: PenLine,
      title: t`Act on your behalf`,
      detail: t`Save and like articles, follow publications and readers, mark things read, and change your lists. Each of these writes a public record to your repo.`,
    });
  }

  return (
    <AuthorizeShell>
      <Flex direction="column" gap="4xl">
        <Heading1 style={styles.question}>
          <Trans>Connect {view.clientName} to your account?</Trans>
        </Heading1>

        <dl {...stylex.props(styles.facts)}>
          <dt {...stylex.props(styles.factTerm)}>
            <Text size="sm" variant="secondary">
              <Trans>Signed in as</Trans>
            </Text>
          </dt>
          <dd {...stylex.props(styles.factValue)}>
            <Avatar
              size="sm"
              src={view.reader.avatar ?? undefined}
              alt=""
              fallback={view.reader.handle.slice(0, 1).toUpperCase()}
            />
            <Text size="sm" style={styles.factText}>
              {view.reader.handle}
            </Text>
          </dd>

          <dt {...stylex.props(styles.factTerm)}>
            <Text size="sm" variant="secondary">
              <Trans>Returns you to</Trans>
            </Text>
          </dt>
          <dd {...stylex.props(styles.factValue)}>
            <Text font="mono" size="sm" style={styles.factText}>
              {view.redirectHost}
            </Text>
          </dd>
        </dl>

        <Flex direction="column" gap="lg">
          <Text size="sm" variant="secondary">
            <Trans>If you continue, it will be able to:</Trans>
          </Text>
          <ul {...stylex.props(styles.scopeList)}>
            {scopeCopy.map((scope, index) => {
              const Icon = scope.icon;
              return (
                <li
                  key={scope.key}
                  {...stylex.props(
                    styles.scopeItem,
                    index === scopeCopy.length - 1 && styles.scopeItemLast,
                  )}
                >
                  <Icon {...stylex.props(styles.scopeIcon)} aria-hidden />
                  <Flex direction="column" gap="xs">
                    <Text size="base" weight="medium">
                      {scope.title}
                    </Text>
                    <Text size="sm" variant="secondary" leading="base">
                      {scope.detail}
                    </Text>
                  </Flex>
                </li>
              );
            })}
          </ul>
        </Flex>

        <Text size="sm" variant="secondary" leading="base">
          <Trans>
            You can disconnect it at any time from Settings. Standard Reader
            never shares your password — only the access you grant here.
          </Trans>
        </Text>

        {approve.isError || deny.isError ? (
          <Text size="sm" variant="critical" leading="base" role="alert">
            <Trans>
              Something went wrong. Nothing was connected — try again.
            </Trans>
          </Text>
        ) : null}

        <div {...stylex.props(styles.actions)}>
          <Button
            variant="secondary"
            size="lg"
            style={styles.actionButton}
            isDisabled={approve.isPending}
            isPending={deny.isPending}
            onPress={() => deny.mutate()}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="primary"
            size="lg"
            style={styles.actionButton}
            isDisabled={busy}
            isPending={approve.isPending}
            onPress={() => approve.mutate()}
          >
            <Trans>Connect</Trans>
          </Button>
        </div>
      </Flex>
    </AuthorizeShell>
  );
}
