"use client";

import { Menu, MenuItem, MenuSeparator, SubMenu } from "#/design-system/menu";
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
  trigger,
  onShare,
  isOpen,
  onOpenChange,
  children,
}: {
  getLinkUrl: () => string | null;
  trigger: React.ReactNode;
  onShare?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const nativeShareAvailable = useNativeShareAvailable();
  const resolveLinkUrl = () => getLinkUrl();

  const openShareUrl = (buildUrl: (linkUrl: string) => string) => {
    const linkUrl = resolveLinkUrl();
    if (!linkUrl) return;
    openExternal(buildUrl(linkUrl));
    onShare?.();
  };

  return (
    <Menu trigger={trigger} isOpen={isOpen} onOpenChange={onOpenChange}>
      <MenuItem
        isDisabled={!resolveLinkUrl()}
        onPress={() => {
          openShareUrl(buildBlueskyComposeUrl);
        }}
      >
        Share to Bluesky
      </MenuItem>
      <SubMenu
        trigger={
          <MenuItem isDisabled={!resolveLinkUrl()}>
            Share to Alternate Client
          </MenuItem>
        }
      >
        {AT_PROTO_COMPOSE_CLIENTS.map((client) => (
          <MenuItem
            key={client.id}
            onPress={() => {
              const linkUrl = resolveLinkUrl();
              if (!linkUrl) return;
              openExternal(buildAtprotoComposeUrl(client.origin, linkUrl));
              onShare?.();
            }}
          >
            {client.label}
          </MenuItem>
        ))}
      </SubMenu>
      <MenuSeparator />
      <MenuItem
        isDisabled={!resolveLinkUrl()}
        onPress={() => {
          openShareUrl(buildDisperseShareUrl);
        }}
      >
        Send to Disperse
      </MenuItem>
      {nativeShareAvailable ? (
        <>
          <MenuSeparator />
          <MenuItem
            isDisabled={!resolveLinkUrl()}
            onPress={() => {
              const linkUrl = resolveLinkUrl();
              if (!linkUrl) return;
              void shareLinkUrl(linkUrl).then((shared) => {
                if (shared) onShare?.();
              });
            }}
          >
            Share elsewhere
          </MenuItem>
        </>
      ) : null}
      {children}
    </Menu>
  );
}
