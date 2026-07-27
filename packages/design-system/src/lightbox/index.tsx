"use client";

import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import { DirectionalIcon } from "../directional-icon";
import { IconButton } from "../icon-button";
import {
  animationDuration,
  animationTimingFunction,
  animations,
} from "../theme/animations.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { fontFamily, fontSize } from "../theme/typography.stylex";

const ALT_TRANSITION_DURATION_MS = 200;
const CONTROL_SETTLE_DURATION_MS = 80;

type CaptionPhase = "entering" | "active" | "exiting";

interface CaptionItem {
  key: number;
  text: string;
  phase: CaptionPhase;
}

interface PendingCaption {
  key: number;
  text: string;
}

const styles = stylex.create({
  overlay: {
    inset: 0,
    alignItems: "stretch",
    animationDuration: animationDuration.default,
    animationName: animations.fadeIn,
    animationTimingFunction: animationTimingFunction.easeIn,
    backgroundColor: "light-dark(rgba(4, 1, 1, 0.72), rgba(0, 0, 0, 0.88))",
    display: "flex",
    opacity: {
      default: 1,
      ":is([data-exiting])": 0,
    },
    position: "fixed",
    transitionDuration: {
      ":is([data-exiting])": animationDuration.fast,
    },
    transitionProperty: "opacity",
    transitionTimingFunction: "ease-in-out",
    zIndex: 200,
  },
  modal: {
    outline: "none",
    position: "relative",
    zIndex: 1,
    height: "100vh",
    width: "100vw",
  },
  dialog: {
    outline: "none",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    width: "100%",
  },
  closeButton: {
    position: "fixed",
    zIndex: 210,
    insetInlineEnd: horizontalSpace["3xl"],
    top: verticalSpace["3xl"],
  },
  hiddenTrigger: {
    display: "none",
  },
  content: {
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingTop: verticalSpace["6xl"],
    width: "100%",
  },
  track: {
    scrollSnapType: "x mandatory",
    display: "grid",
    flexGrow: 1,
    gridAutoColumns: "100%",
    gridAutoFlow: "column",
    minHeight: 0,
    overflowX: "auto",
    width: "100%",
  },
  slide: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    scrollSnapAlign: "center",
    scrollSnapStop: "always",
    minHeight: 0,
    width: "100%",
  },
  slideInner: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    maxWidth: "100%",
    minHeight: 0,
  },
  slideImageFrame: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    maxHeight: "72vh",
    maxWidth: "100%",
  },
  slideImage: {
    objectFit: "contain",
    height: "auto",
    maxHeight: "72vh",
    maxWidth: "100%",
    width: "auto",
  },
  captionRegion: {
    alignItems: "center",
    display: "grid",
    justifyItems: "center",
    maxWidth: "min(100%, 42rem)",
    minHeight: "calc(2em * 1.2)",
    width: "100%",
  },
  captionText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    gridColumnStart: "1",
    gridRowStart: "1",
    lineHeight: 1.2,
    textAlign: "center",
    whiteSpace: "pre-wrap",
    maxWidth: "100%",
  },
  captionTextEntering: {
    animationDuration: animationDuration.slow,
    animationName: animations.fadeIn,
    animationTimingFunction: animationTimingFunction.easeOut,
    opacity: 1,
  },
  captionTextExiting: {
    animationDuration: animationDuration.slow,
    animationName: animations.fadeOut,
    animationTimingFunction: animationTimingFunction.easeIn,
    opacity: 0,
    pointerEvents: "none",
  },
  controls: {
    gap: gap.lg,
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  counter: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textAlign: "center",
    minWidth: size["4xl"],
  },
});

export interface LightboxImage {
  src: string;
  alt?: string;
  transitionName?: string;
}

export interface LightboxProps extends StyleXComponentProps<object> {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  images: Array<LightboxImage>;
  initialIndex?: number;
  alt?: string;
  trigger?: React.ReactNode;
}

/**
 * Horizontal scroll offset for a carousel page.
 *
 * `scrollLeft` runs negative under RTL (0 at the right edge down to
 * -maxScroll), so a plain `index * width` scrolls the wrong way and lands on
 * the first slide every time.
 */
function pageScrollLeft(scroll: HTMLElement, index: number): number {
  const isRtl = globalThis.getComputedStyle(scroll).direction === "rtl";
  return (isRtl ? -1 : 1) * index * scroll.clientWidth;
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function getCaptionText(image?: LightboxImage) {
  return image?.alt?.trim() || "";
}

export function Lightbox({
  isOpen,
  onOpenChange,
  images,
  initialIndex = 0,
  alt = "Image",
  style,
  trigger,
}: LightboxProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimeoutRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [settledIndex, setSettledIndex] = useState(initialIndex);
  const [hasSyncedOpenIndex, setHasSyncedOpenIndex] = useState(false);
  const [captionItem, setCaptionItem] = useState<CaptionItem | null>(null);
  const [pendingCaption, setPendingCaption] = useState<PendingCaption | null>(
    null,
  );

  const hasMultiple = images.length > 1;
  const clampedInitialIndex = Math.min(
    Math.max(0, initialIndex),
    Math.max(0, images.length - 1),
  );
  const activeIndex =
    isOpen && !hasSyncedOpenIndex ? clampedInitialIndex : currentIndex;
  const controlsIndex =
    isOpen && !hasSyncedOpenIndex ? clampedInitialIndex : settledIndex;

  useEffect(() => {
    if (isOpen) return;
    setHasSyncedOpenIndex(false);
    if (settleTimeoutRef.current !== null) {
      globalThis.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (settleTimeoutRef.current !== null) {
        globalThis.clearTimeout(settleTimeoutRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(clampedInitialIndex);
    setSettledIndex(clampedInitialIndex);
    setHasSyncedOpenIndex(true);
    const scroll = scrollRef.current;
    if (!scroll) return;
    requestAnimationFrame(() => {
      scroll.scrollTo({
        left: pageScrollLeft(scroll, clampedInitialIndex),
        behavior: "auto",
      });
    });
  }, [clampedInitialIndex, isOpen]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const nextIndex = Math.max(0, Math.min(images.length - 1, index));
      setCurrentIndex(nextIndex);
      if (settleTimeoutRef.current !== null) {
        globalThis.clearTimeout(settleTimeoutRef.current);
      }
      settleTimeoutRef.current = globalThis.setTimeout(
        () => {
          setSettledIndex(nextIndex);
          settleTimeoutRef.current = null;
        },
        prefersReducedMotion() ? 0 : CONTROL_SETTLE_DURATION_MS,
      );
      scroll.scrollTo({
        left: pageScrollLeft(scroll, nextIndex),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [images.length],
  );

  useEffect(() => {
    if (!isOpen || !hasMultiple) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollToIndex(activeIndex + 1);
      }
    };

    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, hasMultiple, isOpen, scrollToIndex]);

  useEffect(() => {
    if (!isOpen) {
      setCaptionItem(null);
      setPendingCaption(null);
      return;
    }

    const nextText = getCaptionText(images[activeIndex]);
    if (prefersReducedMotion()) {
      setPendingCaption(null);
      setCaptionItem(
        nextText ? { key: activeIndex, text: nextText, phase: "active" } : null,
      );
      return;
    }

    if (!nextText) {
      setPendingCaption(null);
      setCaptionItem((currentCaption) =>
        currentCaption ? { ...currentCaption, phase: "exiting" } : null,
      );
      return;
    }

    if (!captionItem) {
      setPendingCaption(null);
      setCaptionItem({ key: activeIndex, text: nextText, phase: "entering" });
      return;
    }

    if (captionItem.text === nextText) {
      if (captionItem.key !== activeIndex || captionItem.phase !== "active") {
        setCaptionItem({ key: activeIndex, text: nextText, phase: "active" });
      }
      setPendingCaption(null);
      return;
    }

    setPendingCaption({ key: activeIndex, text: nextText });
    if (captionItem.phase !== "exiting") {
      setCaptionItem({ ...captionItem, phase: "exiting" });
    }
  }, [activeIndex, captionItem, images, isOpen]);

  useEffect(() => {
    if (captionItem?.phase !== "entering") return;

    const animationFrame = requestAnimationFrame(() => {
      setCaptionItem((currentCaption) =>
        currentCaption?.phase === "entering"
          ? { ...currentCaption, phase: "active" }
          : currentCaption,
      );
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [captionItem]);

  useEffect(() => {
    if (captionItem?.phase !== "exiting") return;

    const timeoutId = globalThis.setTimeout(() => {
      if (pendingCaption) {
        setCaptionItem({ ...pendingCaption, phase: "entering" });
        setPendingCaption(null);
        return;
      }
      setCaptionItem(null);
    }, ALT_TRANSITION_DURATION_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [captionItem, pendingCaption]);

  if (images.length === 0) return null;

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger || <span {...stylex.props(styles.hiddenTrigger)} />}
      <ModalOverlay
        isDismissable
        {...stylex.props(ui.overlay, styles.overlay, style)}
      >
        <Modal {...stylex.props(styles.modal)}>
          <AriaDialog aria-label={alt} {...stylex.props(styles.dialog)}>
            <div
              data-lightbox-chrome=""
              style={{ viewTransitionName: "none" }}
              {...stylex.props(styles.closeButton)}
            >
              <IconButton
                aria-label="Close"
                size="lg"
                slot="close"
                variant="secondary"
              >
                <X size={24} />
              </IconButton>
            </div>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              {...stylex.props(styles.content)}
              onClick={(event) => {
                if (event.target === event.currentTarget) onOpenChange(false);
              }}
            >
              <div
                ref={scrollRef}
                {...stylex.props(styles.track)}
                onScroll={() => {
                  const scroll = scrollRef.current;
                  if (!scroll || scroll.clientWidth === 0) return;
                  // Under RTL, browsers report scrollLeft as negative (0 at the
                  // right edge, down to -maxScroll). Without abs() the index
                  // clamps to 0 and the carousel never advances.
                  const nextIndex = Math.max(
                    0,
                    Math.min(
                      images.length - 1,
                      Math.round(
                        Math.abs(scroll.scrollLeft) / scroll.clientWidth,
                      ),
                    ),
                  );
                  setCurrentIndex(nextIndex);
                  if (settleTimeoutRef.current !== null) {
                    globalThis.clearTimeout(settleTimeoutRef.current);
                  }
                  settleTimeoutRef.current = globalThis.setTimeout(() => {
                    setSettledIndex(nextIndex);
                    settleTimeoutRef.current = null;
                  }, CONTROL_SETTLE_DURATION_MS);
                }}
              >
                {images.map((image, index) => {
                  const imageAlt = image.alt?.trim() || "";
                  const fallbackAlt = hasMultiple
                    ? `${alt} ${String(index + 1)}`
                    : alt;
                  return (
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                    <div
                      key={index}
                      {...stylex.props(styles.slide)}
                      onClick={(event) => {
                        if (event.target === event.currentTarget) {
                          onOpenChange(false);
                        }
                      }}
                    >
                      <div
                        {...stylex.props(styles.slideInner, ui.textContrast)}
                      >
                        <div
                          {...stylex.props(styles.slideImageFrame)}
                          style={
                            index === activeIndex && image.transitionName
                              ? { viewTransitionName: image.transitionName }
                              : undefined
                          }
                        >
                          <img
                            alt={imageAlt || fallbackAlt}
                            referrerPolicy="no-referrer"
                            src={image.src}
                            {...stylex.props(styles.slideImage)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {captionItem ? (
                <div
                  aria-live="polite"
                  data-lightbox-chrome=""
                  style={{ viewTransitionName: "none" }}
                  {...stylex.props(styles.captionRegion, ui.textContrast)}
                >
                  <div
                    key={captionItem.key}
                    {...stylex.props(
                      styles.captionText,
                      captionItem.phase === "entering"
                        ? styles.captionTextEntering
                        : undefined,
                      captionItem.phase === "exiting"
                        ? styles.captionTextExiting
                        : undefined,
                    )}
                  >
                    {captionItem.text}
                  </div>
                </div>
              ) : null}
              {hasMultiple ? (
                <div
                  data-lightbox-chrome=""
                  style={{ viewTransitionName: "none" }}
                  {...stylex.props(styles.controls, ui.textContrast)}
                >
                  <IconButton
                    aria-label="Previous image"
                    size="lg"
                    variant="secondary"
                    isDisabled={controlsIndex <= 0}
                    onPress={() => scrollToIndex(activeIndex - 1)}
                  >
                    <DirectionalIcon as={ChevronLeft} size={24} />
                  </IconButton>
                  <div {...stylex.props(styles.counter)}>
                    {activeIndex + 1} / {images.length}
                  </div>
                  <IconButton
                    aria-label="Next image"
                    size="lg"
                    variant="secondary"
                    isDisabled={controlsIndex >= images.length - 1}
                    onPress={() => scrollToIndex(activeIndex + 1)}
                  >
                    <DirectionalIcon as={ChevronRight} size={24} />
                  </IconButton>
                </div>
              ) : null}
            </div>
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
