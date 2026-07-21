"use client";

import { Trans, useLingui } from "@lingui/react/macro";

import { Menu, MenuItem, MenuSeparator, SubMenu } from "@standard-reader/design-system/menu";
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

  return (
    <Menu trigger={trigger} isOpen={isOpen} onOpenChange={onOpenChange}>
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
      <MenuSeparator />
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
          <MenuSeparator />
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
