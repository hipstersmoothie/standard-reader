import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { Separator } from "#/design-system/separator";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { Text } from "#/design-system/typography/text";
import { BrandWordmark } from "#/components/reader/brand-wordmark";
import { Settings, X } from "lucide-react";
import { useState } from "react";

import type {
  ExtensionResolveResult,
  ExtensionSessionResponse,
} from "../lib/types";

import type { PopupStateResponse } from "../lib/popup-state";
import { sendMessage } from "../lib/messaging";
import { ExtensionTheme } from "./ExtensionTheme";
import { ExtensionThemeToggle } from "./ExtensionThemeToggle";
import { PopupSignIn } from "./PopupSignIn";
import { PopupArticle } from "./PopupArticle";
import { PopupPublication } from "./PopupPublication";
import { PopupSignedInFooter } from "./PopupSignedInFooter";
import { PopupUnknown } from "./PopupUnknown";

const styles = stylex.create({
  shell: {
    boxSizing: "border-box",
    width: "100%",
  },
  headerBlock: {
    boxSizing: "border-box",
    width: "100%",
  },
  headerToolbar: {
    boxSizing: "border-box",
    paddingBlock: verticalSpace["2xl"],
    paddingInline: horizontalSpace["4xl"],
    width: "100%",
  },
  brandButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderStyle: "none",
    cursor: "pointer",
    display: "inline-flex",
    padding: horizontalSpace.none,
    paddingLeft: horizontalSpace.xs,
  },
  headerSpacer: {
    flex: 1,
    minWidth: 0,
  },
  inset: {
    boxSizing: "border-box",
    paddingInline: horizontalSpace.md,
  },
  footerBlock: {
    boxSizing: "border-box",
    width: "100%",
  },
});

function openOptions(): void {
  void browser.runtime.openOptionsPage();
}

type PopupShellProps = {
  initialState: PopupStateResponse | null;
  initialError?: string | null;
};

export function PopupShell({
  initialState,
  initialError = null,
}: PopupShellProps) {
  const [session, setSession] = useState<ExtensionSessionResponse | null>(
    initialState?.session ?? null,
  );
  const [tabUrl, setTabUrl] = useState<string | null>(
    initialState?.tabUrl ?? null,
  );
  const [result, setResult] = useState<ExtensionResolveResult | null>(
    initialState?.result ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);

  const signIn = async () => {
    await sendMessage({ type: "openLogin" });
  };

  const toggleBookmark = async () => {
    if (result?.kind !== "article") return;
    const nextSaved = !result.isBookmarked;
    setResult({ ...result, isBookmarked: nextSaved });
    setBusy(true);
    try {
      await sendMessage({
        type: "bookmark",
        documentUri: result.documentUri,
        save: nextSaved,
      });
    } catch (error) {
      setResult({ ...result, isBookmarked: !nextSaved });
      setLoadError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleFollow = async () => {
    if (
      !result ||
      (result.kind !== "article" && result.kind !== "publication")
    ) {
      return;
    }
    const publicationUri =
      result.kind === "article" ? result.publicationUri : result.publicationUri;
    if (!publicationUri) return;
    const nextFollowing = !(result.isFollowing ?? false);
    const previous = result;
    setResult({ ...result, isFollowing: nextFollowing });
    setBusy(true);
    try {
      await sendMessage({
        type: "follow",
        publicationUri,
        follow: nextFollowing,
      });
    } catch (error) {
      setResult(previous);
      setLoadError(error instanceof Error ? error.message : "Subscribe failed");
    } finally {
      setBusy(false);
    }
  };

  const openReader = async () => {
    if (!result) return;
    if (result.kind === "article" || result.kind === "reader-link") {
      await sendMessage({
        type: "openReader",
        url: result.kind === "article" ? result.readerUrl : result.readerUrl,
      });
    } else if (result.kind === "publication") {
      await sendMessage({ type: "openReader", url: result.readerUrl });
    }
  };

  const openOptionsPage = () => {
    openOptions();
  };

  const openHome = () => {
    void sendMessage({ type: "openReader", url: "/" });
  };

  const openDiscover = () => {
    void sendMessage({ type: "openReader", url: "/discover" });
  };

  const openSaved = () => {
    void sendMessage({ type: "openReader", url: "/saved" });
  };

  const closePopup = () => {
    window.close();
  };

  const showBody = initialState != null && !loadError;
  const signedOut = showBody && !session?.signedIn;
  const signedIn = showBody && session?.signedIn;

  return (
    <ExtensionTheme variant="popup">
      <Flex direction="column" style={styles.shell}>
        <Flex direction="column" style={styles.headerBlock}>
          <Flex
            direction="row"
            gap="sm"
            align="center"
            style={styles.headerToolbar}
          >
            <button
              type="button"
              {...stylex.props(styles.brandButton)}
              onClick={openHome}
            >
              <BrandWordmark />
            </button>
            <div {...stylex.props(styles.headerSpacer)} />
            <Flex direction="row" gap="sm" align="center">
              {!session?.signedIn ? <ExtensionThemeToggle /> : null}
              <IconButton
                aria-label="Extension settings"
                variant="tertiary"
                size="md"
                onPress={openOptionsPage}
              >
                <Settings size={18} />
              </IconButton>
            </Flex>
            <IconButton
              aria-label="Close"
              variant="tertiary"
              size="md"
              onPress={closePopup}
            >
              <X size={18} />
            </IconButton>
          </Flex>

          <Separator />
        </Flex>

        {loadError ? (
          <Text color="critical" style={styles.inset}>
            {loadError}
          </Text>
        ) : null}

        {signedOut ? <PopupSignIn result={result} onSignIn={signIn} /> : null}

        {signedIn && result?.kind === "article" ? (
          <PopupArticle
            result={result}
            busy={busy}
            onSave={toggleBookmark}
            onFollow={toggleFollow}
            onOpenReader={openReader}
          />
        ) : null}

        {signedIn && result?.kind === "publication" ? (
          <PopupPublication
            result={result}
            busy={busy}
            onFollow={toggleFollow}
            onOpenReader={openReader}
          />
        ) : null}

        {signedIn &&
        result &&
        result.kind !== "article" &&
        result.kind !== "publication" ? (
          <Flex direction="column" gap="md" style={styles.inset}>
            {result.kind === "reader-link" ? (
              <Flex direction="column" gap="sm">
                <Text color="muted">
                  You&apos;re already in Standard Reader.
                </Text>
                <Button variant="secondary" onPress={openReader}>
                  Open page
                </Button>
              </Flex>
            ) : null}

            {result.kind === "unknown" ? (
              <PopupUnknown tabUrl={tabUrl} onBrowseDiscover={openDiscover} />
            ) : null}
          </Flex>
        ) : null}

        {signedIn && session ? (
          <Flex direction="column" style={styles.footerBlock}>
            <Separator />
            <PopupSignedInFooter session={session} onViewSaved={openSaved} />
          </Flex>
        ) : null}
      </Flex>
    </ExtensionTheme>
  );
}
