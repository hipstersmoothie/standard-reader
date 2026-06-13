import * as stylex from "@stylexjs/stylex";
import { BrandWordmark } from "#/components/reader/brand-wordmark";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { Separator } from "#/design-system/separator";
import { uiColor } from "#/design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { Text } from "#/design-system/typography/text";
import { Settings, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { PopupStateResponse } from "../lib/popup-state";
import type { ExtensionResolveResult } from "../lib/types";
import type { PopupReaderArticle } from "./PopupReaderBar";

import { sendMessage } from "../lib/messaging";
import { setPopupDimensions } from "../lib/popup-dimensions";
import { useReaderSnapshot } from "../lib/use-reader-snapshot";
import { ExtensionTheme } from "./ExtensionTheme";
import { PopupArticle } from "./PopupArticle";
import { PopupPublication } from "./PopupPublication";
import { PopupReaderBar } from "./PopupReaderBar";
import { PopupSignedInFooter } from "./PopupSignedInFooter";
import { PopupSignIn } from "./PopupSignIn";
import { PopupUnknown } from "./PopupUnknown";

const styles = stylex.create({
  shell: {
    boxSizing: "border-box",
    minHeight: "100%",
    width: "100%",
  },
  shellDiscussion: {
    overflow: "hidden",
    height: "100%",
    minHeight: 0,
  },
  main: {
    boxSizing: "border-box",
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
    width: "100%",
  },
  mainDiscussion: {
    overflow: "hidden",
  },
  chromeSticky: {
    backgroundColor: uiColor.bg,
    flexShrink: 0,
  },
  headerBlock: {
    boxSizing: "border-box",
    width: "100%",
  },
  headerToolbar: {
    paddingBlock: verticalSpace["2xl"],
    paddingInline: horizontalSpace["4xl"],
    boxSizing: "border-box",
    width: "100%",
  },
  brandButton: {
    padding: horizontalSpace.none,
    borderStyle: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    cursor: "pointer",
    display: "inline-flex",
    paddingLeft: horizontalSpace.xs,
  },
  headerSpacer: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  inset: {
    paddingInline: horizontalSpace.md,
    boxSizing: "border-box",
  },
  readerBarSticky: {
    flexShrink: 0,
  },
  footerBlock: {
    boxSizing: "border-box",
    width: "100%",
  },
});

function openOptions(): void {
  void browser.runtime.openOptionsPage();
}

function closePopup(): void {
  globalThis.close();
}

type PopupShellProps = {
  initialState: PopupStateResponse | null;
  initialError?: string | null;
};

export function PopupShell({
  initialState,
  initialError = null,
}: PopupShellProps) {
  const session = initialState?.session ?? null;
  const tabUrl = initialState?.tabUrl ?? null;
  const [result, setResult] = useState<ExtensionResolveResult | null>(
    initialState?.result ?? null,
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [listenStarting, setListenStarting] = useState(false);
  const [listenError, setListenError] = useState<string | null>(null);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const {
    supported: readerSupported,
    snapshot,
    setSnapshot,
  } = useReaderSnapshot();

  const articleDocumentUri =
    result?.kind === "article" ? result.documentUri : null;

  useEffect(() => {
    setDiscussionOpen(false);
  }, [articleDocumentUri]);

  useEffect(() => {
    setPopupDimensions(discussionOpen ? "discussion" : "default");
  }, [discussionOpen]);

  const signIn = async () => {
    await sendMessage({ type: "openLogin" });
  };

  const toggleBookmark = async () => {
    if (result?.kind !== "article") return;
    const nextSaved = !result.isBookmarked;
    setResult({ ...result, isBookmarked: nextSaved });
    setSaveBusy(true);
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
      setSaveBusy(false);
    }
  };

  const toggleRecommend = async () => {
    if (result?.kind !== "article") return;
    const nextRecommended = !result.isRecommended;
    const nextCount = Math.max(
      0,
      result.recommendCount + (nextRecommended ? 1 : -1),
    );
    const previous = result;
    setResult({
      ...result,
      isRecommended: nextRecommended,
      recommendCount: nextCount,
    });
    setLikeBusy(true);
    try {
      await sendMessage({
        type: "recommend",
        documentUri: result.documentUri,
        recommend: nextRecommended,
      });
    } catch (error) {
      setResult(previous);
      setLoadError(error instanceof Error ? error.message : "Like failed");
    } finally {
      setLikeBusy(false);
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
    setFollowBusy(true);
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
      setFollowBusy(false);
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

  const openReaderUrl = async (url: string) => {
    await sendMessage({ type: "openReader", url });
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

  const playArticle = async (target: PopupReaderArticle) => {
    setListenError(null);
    setListenStarting(true);
    try {
      await sendMessage({
        type: "readerPlay",
        documentUri: target.documentUri,
        title: target.title,
      });
    } catch (error) {
      setListenError(
        error instanceof Error ? error.message : "Couldn’t start reading.",
      );
    } finally {
      setListenStarting(false);
    }
  };

  const showBody = initialState != null && !loadError;
  const signedOut = showBody && !session?.signedIn;
  const signedIn = showBody && session?.signedIn;
  const readerArticle =
    result?.kind === "article"
      ? { documentUri: result.documentUri, title: result.title }
      : null;
  const readerState = snapshot?.state ?? null;
  const readerActive = readerState !== null && readerState.status !== "idle";
  const playingThisArticle =
    readerArticle != null &&
    readerActive &&
    snapshot?.nowPlaying?.documentUri === readerArticle.documentUri;
  const showListenInArticle =
    readerSupported !== false && readerArticle != null && !playingThisArticle;

  return (
    <ExtensionTheme variant="popup" discussionOpen={discussionOpen}>
      <Flex
        direction="column"
        style={[styles.shell, discussionOpen && styles.shellDiscussion]}
      >
        <Flex
          direction="column"
          style={[styles.headerBlock, discussionOpen && styles.chromeSticky]}
        >
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

        <Flex
          direction="column"
          style={[styles.main, discussionOpen && styles.mainDiscussion]}
        >
          {signedOut ? <PopupSignIn result={result} onSignIn={signIn} /> : null}

          {signedIn && result?.kind === "article" ? (
            <PopupArticle
              result={result}
              saveBusy={saveBusy}
              likeBusy={likeBusy}
              followBusy={followBusy}
              onSave={toggleBookmark}
              onLike={toggleRecommend}
              onFollow={toggleFollow}
              onOpenReader={openReader}
              onOpenReaderUrl={openReaderUrl}
              showListen={showListenInArticle}
              listenStarting={listenStarting}
              listenError={listenError}
              discussionOpen={discussionOpen}
              onDiscussionOpenChange={setDiscussionOpen}
              onListen={() => {
                if (readerArticle) void playArticle(readerArticle);
              }}
            />
          ) : null}

          {signedIn && result?.kind === "publication" ? (
            <PopupPublication
              result={result}
              followBusy={followBusy}
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
        </Flex>

        {signedIn && session && readerActive ? (
          <div {...stylex.props(discussionOpen && styles.readerBarSticky)}>
            <PopupReaderBar
              article={readerArticle}
              snapshot={snapshot}
              setSnapshot={setSnapshot}
              onPlay={playArticle}
              starting={listenStarting}
              playError={listenError}
            />
          </div>
        ) : null}

        {signedIn && session ? (
          <Flex
            direction="column"
            style={[styles.footerBlock, discussionOpen && styles.chromeSticky]}
          >
            <Separator />
            <PopupSignedInFooter session={session} onViewSaved={openSaved} />
          </Flex>
        ) : null}
      </Flex>
    </ExtensionTheme>
  );
}
