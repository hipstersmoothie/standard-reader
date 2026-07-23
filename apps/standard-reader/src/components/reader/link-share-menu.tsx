"use client";

import { Trans, useLingui } from "@lingui/react/macro";

import { Menu, MenuItem, MenuSeparator, SubMenu } from "@standard-reader/design-system/menu";
import { toasts } from "@standard-reader/design-system/toast";
import { shareLinkUrl, useNativeShareAvailable } from "#/lib/native-share";
import {
  AT_PROTO_COMPOSE_CLIENTS,
  buildAtprotoComposeUrl,
  buildBlueskyComposeUrl,
  buildDisperseShareUrl,
} from "#/lib/quote-share";

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

export function LinkShareMenu({
  getLinkUrl,
  ensureLinkUrl,
  trigger,
  onShare,
  isOpen,
  onOpenChange,
  children,
}: {
  getLinkUrl: () => string | null;
  /** Lazily create the link URL on demand when a share action is taken. */
  ensureLinkUrl?: () => Promise<string | null>;
  trigger: React.ReactNode;
  onShare?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const { t } = useLingui();
  const nativeShareAvailable = useNativeShareAvailable();
  const resolveLinkUrl = () => getLinkUrl();

  // When ensureLinkUrl is provided, items are always enabled — the URL is
  // created on press, not beforehand. Otherwise items disable until a URL is
  // available.
  const canShare = Boolean(ensureLinkUrl) || Boolean(resolveLinkUrl());

  const openShareUrl = async (buildUrl: (linkUrl: string) => string) => {
    const linkUrl = ensureLinkUrl ? await ensureLinkUrl() : resolveLinkUrl();
    if (!linkUrl) return;
    openExternal(buildUrl(linkUrl));
    onShare?.();
  };

  // Deliberately does not call `onShare`: copying doesn't navigate anywhere, so
  // callers that dismiss on share (the selection toolbar) should stay put and
  // let the toast be the confirmation.
  const copyLinkUrl = async () => {
    const linkUrl = ensureLinkUrl ? await ensureLinkUrl() : resolveLinkUrl();
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    toasts.add(
      { title: t`Link copied`, variant: "success" },
      { timeout: 2000 },
    );
  };

  // Three groups, by what the action actually does — separators mark those
  // boundaries and nothing else. Punctuating every row (as this menu used to)
  // reads as noise and stops communicating grouping at all.
  //
  //   1. keep it here          Copy link
  //   2. send it somewhere     Bluesky · alternate client · Disperse · OS sheet
  //   3. per-surface extras    {children} — each opens with its own separator
  //
  // The OS share sheet sits last in group 2 as the catch-all, after the named
  // destinations it generalizes.
  return (
    <Menu trigger={trigger} isOpen={isOpen} onOpenChange={onOpenChange}>
      <MenuItem
        isDisabled={!canShare}
        onPress={() => {
          void copyLinkUrl();
        }}
        textValue={t`Copy link`}
      >
        <Trans>Copy link</Trans>
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        isDisabled={!canShare}
        onPress={() => {
          void openShareUrl(buildBlueskyComposeUrl);
        }}
        textValue={t`Share to Bluesky`}
      >
        <Trans>Share to Bluesky</Trans>
      </MenuItem>
      <SubMenu
        trigger={
          <MenuItem
            isDisabled={!canShare}
            textValue={t`Share to Alternate Client`}
          >
            <Trans>Share to Alternate Client</Trans>
          </MenuItem>
        }
      >
        {AT_PROTO_COMPOSE_CLIENTS.map((client) => (
          <MenuItem
            key={client.id}
            onPress={() => {
              void openShareUrl((linkUrl) =>
                buildAtprotoComposeUrl(client.origin, linkUrl),
              );
            }}
          >
            {client.label}
          </MenuItem>
        ))}
      </SubMenu>
      <MenuItem
        isDisabled={!canShare}
        onPress={() => {
          void openShareUrl(buildDisperseShareUrl);
        }}
        textValue={t`Send to Disperse`}
      >
        <Trans>Send to Disperse</Trans>
      </MenuItem>
      {nativeShareAvailable ? (
        <>
          <MenuItem
            isDisabled={!canShare}
            onPress={() => {
              void (async () => {
                const linkUrl = ensureLinkUrl
                  ? await ensureLinkUrl()
                  : resolveLinkUrl();
                if (!linkUrl) return;
                const shared = await shareLinkUrl(linkUrl);
                if (shared) onShare?.();
              })();
            }}
            textValue={t`Share elsewhere`}
          >
            <Trans>Share elsewhere</Trans>
          </MenuItem>
        </>
      ) : null}
      {children}
    </Menu>
  );
}
