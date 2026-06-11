"use client";

import type { Size } from "#/design-system/theme/types";

import { IconButton } from "#/design-system/icon-button";
import { Menu, MenuItem, MenuSeparator, SubMenu } from "#/design-system/menu";
import {
  AT_PROTO_COMPOSE_CLIENTS,
  buildAtprotoComposeUrl,
  buildBlueskyComposeUrl,
  buildDisperseShareUrl,
  buildPdslsRecordUrl,
} from "#/lib/quote-share";
import { Share2 } from "lucide-react";

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

function currentPageUrl(): string {
  return globalThis.location.href;
}

export function DocumentShareMenu({
  recordUri,
  size = "md",
}: {
  /** Document AT-URI for PDSLS. */
  recordUri: string;
  size?: Size;
}) {
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <Menu
      trigger={
        <IconButton variant="secondary" size={size} label="Share">
          <Share2 size={iconSize} />
        </IconButton>
      }
    >
      <MenuItem
        onPress={() => {
          openExternal(buildBlueskyComposeUrl(currentPageUrl()));
        }}
      >
        Share to Bluesky
      </MenuItem>
      <SubMenu trigger={<MenuItem>Share to Alternate Client</MenuItem>}>
        {AT_PROTO_COMPOSE_CLIENTS.map((client) => (
          <MenuItem
            key={client.id}
            onPress={() => {
              openExternal(
                buildAtprotoComposeUrl(client.origin, currentPageUrl()),
              );
            }}
          >
            {client.label}
          </MenuItem>
        ))}
      </SubMenu>
      <MenuSeparator />
      <MenuItem
        onPress={() => {
          openExternal(buildDisperseShareUrl(currentPageUrl()));
        }}
      >
        Send to Disperse
      </MenuItem>
      <MenuItem
        onPress={() => {
          openExternal(buildPdslsRecordUrl(recordUri));
        }}
      >
        View on PDSLS
      </MenuItem>
    </Menu>
  );
}
