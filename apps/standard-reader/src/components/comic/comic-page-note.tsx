"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  animationDuration,
  animationTimingFunction,
  animations,
} from "@standard-reader/design-system/theme/animations.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { FileText, X } from "lucide-react";
import type { RefObject } from "react";
import { useCallback } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";

import { comicNoteParagraphs } from "#/lib/comic/page-note";

import { documentLinkParams } from "../reader/format";
import { ButtonLink } from "../router-links";
import { ICON_SIZE, ICON_STROKE } from "./theater-palette";
import { theaterColor } from "./theater.stylex";

const styles = stylex.create({
  // The scrim carries the padding, not the panel: `isDismissable` closes on a
  // press that lands outside the modal element, so any space the panel owns is
  // space a tap-to-close doesn't work in — which on a phone was all of it.
  overlay: {
    inset: 0,
    animationDuration: animationDuration.default,
    animationName: animations.fadeIn,
    animationTimingFunction: animationTimingFunction.easeOut,
    alignItems: "center",
    backdropFilter: "blur(6px)",
    backgroundColor: theaterColor.noteScrim,
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    opacity: { default: 1, ":is([data-exiting])": 0 },
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    // Clear of both bars, which are still there under the scrim.
    paddingBottom: spacing["20"],
    paddingTop: spacing["20"],
    // Over the chrome, not merely over the art: the bars belong to the page
    // underneath, and reading a note is not paging through a comic.
    position: "absolute",
    zIndex: 3,
    transitionDuration: { ":is([data-exiting])": animationDuration.fast },
    transitionProperty: "opacity",
    transitionTimingFunction: animationTimingFunction.easeIn,
  },
  modal: {
    outline: "none",
    display: "flex",
    // The panel is the readable column, not a card: no surface of its own, so
    // the art stays visible right up to the edge of the type. It hugs its own
    // content, which is what leaves the rest of the scrim tappable.
    maxHeight: "100%",
    maxWidth: "38rem",
    minHeight: 0,
    width: "100%",
  },
  dialog: {
    outline: "none",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    rowGap: gap["4xl"],
    width: "100%",
  },
  head: {
    alignItems: "flex-start",
    columnGap: gap["2xl"],
    display: "flex",
    justifyContent: "space-between",
  },
  kicker: {
    color: theaterColor.chrome,
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    paddingTop: spacing["1.5"],
    textTransform: "uppercase",
    // A single-line label beside a button: order its own characters, keep the
    // row's alignment.
    unicodeBidi: "isolate",
  },
  // The note can outrun the screen — a process note runs long — so the column
  // scrolls inside the panel rather than the panel growing past the viewport.
  body: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    rowGap: gap["3xl"],
  },
  paragraph: {
    color: theaterColor.chromeStrong,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    // Prose in an unknown language, so it takes its own direction — unlike the
    // single-line labels around it, which stay aligned to the chrome.
    textWrap: "pretty",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-start",
  },
  // The theater's palette is fixed, so the design-system buttons in it take
  // these colours instead of the app's UI scale (as the reader's chrome does).
  control: {
    backgroundColor: {
      default: "transparent",
      ":hover": theaterColor.surface,
    },
    color: theaterColor.chromeStrong,
    flexShrink: 0,
    borderColor: theaterColor.rule,
    boxShadow: "none",
  },
});

export interface ComicPageNoteProps {
  /** The prose published with this page, or null when there is none. */
  note: string | null;
  /** The page's own post — named in the kicker and linked for the full text. */
  issueTitle: string;
  issueUri: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The theater element. React Aria portals its overlays to `document.body`,
   * which is *outside* the element the reader puts full screen — a note opened
   * in full screen would render to a part of the page the browser isn't
   * painting. Re-pointing the portal at the theater keeps the note inside the
   * thing on screen.
   */
  container: RefObject<HTMLElement | null>;
}

/**
 * The writing that came with a comic page, over the page itself.
 *
 * Comic posts often carry a line or two beside the art — a caption, a note on
 * the process, a word about next week. In the theater that text had nowhere to
 * go: the reader shows images, and the prose lived only in the reading view, a
 * navigation away from the page it was written about. This lays it over the art
 * instead, so the page is still there while the note is read.
 *
 * Plain paragraphs rather than the article renderer: the theater is a fixed
 * dark room with its own type, and the note is a few lines of prose, not a
 * document. Anything richer than that — links, headings, a real body — is what
 * the "Read the full post" escape is for.
 */
export function ComicPageNote({
  note,
  issueTitle,
  issueUri,
  isOpen,
  onOpenChange,
  container,
}: ComicPageNoteProps) {
  const { t } = useLingui();
  const getContainer = useCallback(() => container.current, [container]);
  const paragraphs = comicNoteParagraphs(note);
  const postParams = issueUri ? documentLinkParams(issueUri) : null;

  return (
    <UNSAFE_PortalProvider getContainer={getContainer}>
      <ModalOverlay
        isOpen={isOpen && paragraphs.length > 0}
        onOpenChange={onOpenChange}
        isDismissable
        {...stylex.props(styles.overlay)}
      >
        <Modal {...stylex.props(styles.modal)}>
          <Dialog
            aria-label={t`Note for ${issueTitle}`}
            {...stylex.props(styles.dialog)}
          >
            {({ close }) => (
              <>
                <div {...stylex.props(styles.head)}>
                  <span {...stylex.props(styles.kicker)}>{issueTitle}</span>
                  <IconButton
                    variant="tertiary"
                    aria-label={t`Close the note`}
                    onPress={close}
                    style={styles.control}
                  >
                    <X aria-hidden size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                  </IconButton>
                </div>

                <div {...stylex.props(styles.body)}>
                  {paragraphs.map((paragraph, index) => (
                    <p
                      // Paragraphs of a note have no identity beyond their
                      // position, and the whole list is replaced together.
                      key={index}
                      dir="auto"
                      {...stylex.props(styles.paragraph)}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                {postParams ? (
                  <div {...stylex.props(styles.actions)}>
                    <ButtonLink
                      variant="tertiary"
                      to="/a/$did/$rkey"
                      params={postParams}
                      search={{ view: "reader" }}
                      style={styles.control}
                    >
                      <FileText
                        aria-hidden
                        size={ICON_SIZE}
                        strokeWidth={ICON_STROKE}
                      />
                      <Trans>Read the full post</Trans>
                    </ButtonLink>
                  </div>
                ) : null}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </UNSAFE_PortalProvider>
  );
}
