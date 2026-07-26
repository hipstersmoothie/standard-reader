"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookMarked, Check, Pencil } from "lucide-react";
import { useEffect } from "react";

import type { McpAuthorizeSearch } from "#/integrations/tanstack-query/api-mcp.functions";
import {
  mcpApi,
  mcpAuthorizeSearchSchema,
} from "#/integrations/tanstack-query/api-mcp.functions";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { Button } from "../../design-system/button";
import { Card } from "../../design-system/card";
import { Content } from "../../design-system/content";
import { Flex } from "../../design-system/flex";
import { radius } from "../../design-system/theme/radius.stylex";
import { ui } from "../../design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { Body, Heading1 } from "../../design-system/typography";

const styles = stylex.create({
  page: {
    marginInline: "auto",
    maxWidth: sizeSpace["8xl"],
    paddingBlock: verticalSpace["2xl"],
  },
  scopeRow: {
    borderRadius: radius.md,
    paddingBlock: verticalSpace.sm,
    paddingInline: horizontalSpace.md,
  },
  icon: {
    flexShrink: 0,
    height: sizeSpace.sm,
    width: sizeSpace.sm,
  },
});

/** Human-readable rendering of the scopes an MCP client asked for. */
const SCOPE_COPY: Record<string, { title: string; detail: string }> = {
  "mcp:read": {
    title: "Read your reading",
    detail:
      "Your bookmarks, reading history, likes, subscriptions and lists, plus " +
      "anything public on the network.",
  },
  "mcp:write": {
    title: "Act on your behalf",
    detail:
      "Bookmark and like articles, follow publications and readers, mark " +
      "things read, and change your lists. These become public records in " +
      "your own repo.",
  },
};

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

function AuthorizePage() {
  const view = Route.useLoaderData();
  const search = Route.useSearch();

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
      <Content>
        <div {...stylex.props(styles.page)}>
          <Body>
            <Trans>Returning you to the app…</Trans>
          </Body>
        </div>
      </Content>
    );
  }

  if (view.status === "error") {
    const signInHref = `/login?redirect=${encodeURIComponent(
      buildAuthRedirectPath(currentSearchPath(search)),
    )}`;
    return (
      <Content>
        <div {...stylex.props(styles.page)}>
          <Card>
            <Flex direction="column" gap="md">
              <Heading1>
                <Trans>Can&apos;t connect this app</Trans>
              </Heading1>
              <Body>{view.message}</Body>
              {view.code === "login_required" ? (
                <Button
                  variant="primary"
                  onPress={() => {
                    globalThis.location.href = signInHref;
                  }}
                >
                  <Trans>Sign in to Standard Reader</Trans>
                </Button>
              ) : null}
            </Flex>
          </Card>
        </div>
      </Content>
    );
  }

  const busy = approve.isPending || deny.isPending;

  return (
    <Content>
      <div {...stylex.props(styles.page)}>
        <Card>
          <Flex direction="column" gap="lg">
            <Flex direction="column" gap="sm">
              <Heading1>
                <Trans>Connect {view.clientName}?</Trans>
              </Heading1>
              <Body variant="secondary">
                <Trans>
                  {view.clientName} wants to use Standard Reader as{" "}
                  {view.reader.handle}.
                </Trans>
              </Body>
            </Flex>

            <Flex direction="column" gap="sm">
              {view.scopes.map((scope) => {
                const copy = SCOPE_COPY[scope];
                const Icon = scope === "mcp:write" ? Pencil : BookMarked;
                return (
                  <Flex
                    key={scope}
                    gap="sm"
                    align="start"
                    style={[styles.scopeRow, ui.bgSubtle]}
                  >
                    <Icon {...stylex.props(styles.icon)} aria-hidden />
                    <Flex direction="column" gap="xs">
                      <Body>{copy?.title ?? scope}</Body>
                      <Body variant="secondary">{copy?.detail ?? scope}</Body>
                    </Flex>
                  </Flex>
                );
              })}
            </Flex>

            <Body variant="secondary">
              <Trans>
                You can disconnect this app at any time from Settings. Anything
                it writes goes to your own AT Protocol repo and is public on the
                network.
              </Trans>
            </Body>

            {approve.isError ? (
              <Body variant="critical">
                <Trans>
                  Something went wrong approving this connection. Try again.
                </Trans>
              </Body>
            ) : null}

            <Flex gap="sm">
              <Button
                variant="primary"
                isDisabled={busy}
                onPress={() => approve.mutate()}
              >
                <Check aria-hidden {...stylex.props(styles.icon)} />
                <Trans>Approve</Trans>
              </Button>
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() => deny.mutate()}
              >
                <Trans>Cancel</Trans>
              </Button>
            </Flex>
          </Flex>
        </Card>
      </div>
    </Content>
  );
}
