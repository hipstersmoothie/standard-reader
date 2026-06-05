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

import type { StyleXComponentProps } from "../theme/types";

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
  verticalSpace,
} from "../theme/semantic-spacing.stylex";

const SLIDE_DURATION_MS = 250;

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const styles = stylex.create({
  overlay: {
    inset: 0,
    alignItems: "center",
    animationDuration: animationDuration.default,
    animationName: animations.fadeIn,
    animationTimingFunction: animationTimingFunction.easeIn,
    display: "flex",
    justifyContent: "center",
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
  backdrop: {
    inset: 0,
    position: "absolute",
  },
  modal: {
    outline: "none",
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
    height: "fit-content",
    maxHeight: "90vh",
    maxWidth: "90vw",
    // Shrink to fit content so backdrop remains clickable around the edges
    width: "fit-content",
  },
  dialog: {
    outline: "none",
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    position: "relative",
    minHeight: 0,
  },
  imageWrapper: {
    overflow: "hidden",
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    position: "relative",
    maxHeight: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  image: {
    objectFit: "contain",
    height: "auto",
    maxHeight: "90vh",
    maxWidth: "100%",
    width: "auto",
  },
  imageLayer: {
    inset: 0,
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    position: "absolute",
    height: "100%",
    width: "100%",
  },
  imageLayerOutgoing: {
    zIndex: 2,
  },
  imageLayerIncoming: {
    zIndex: 1,
  },
  closeButton: {
    position: "fixed",
    zIndex: 210,
    right: horizontalSpace["3xl"],
    top: verticalSpace["3xl"],
  },
  hiddenTrigger: {
    display: "none",
  },
  contentRow: {
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 0,
  },
  navButton: {
    flexShrink: 0,
  },
});

export interface LightboxProps extends StyleXComponentProps<object> {
  /** Whether the lightbox is open */
  isOpen: boolean;
  /** Called when the lightbox should close */
  onOpenChange: (isOpen: boolean) => void;
  /** Array of image URLs to display */
  images: Array<string>;
  /** Initial index when opening (default 0) */
  initialIndex?: number;
  /** Alt text for the current image */
  alt?: string;
  /** Trigger element to open the lightbox */
  trigger?: React.ReactNode;
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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [transitionSize, setTransitionSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);

  // Run slide animations via Web Animations API
  useLayoutEffect(() => {
    if (previousIndex === null) return;
    if (prefersReducedMotion()) {
      setPreviousIndex(null);
      setTransitionSize(null);
      return;
    }
    const wrapper = wrapperRef.current;
    const outgoing = outgoingRef.current;
    const incoming = incomingRef.current;
    if (!wrapper || !outgoing || !incoming) return;

    const runAnimation = () => {
      const viewportWidth =
        globalThis.visualViewport?.width ?? globalThis.innerWidth;
      const wrapperWidth = transitionSize
        ? transitionSize.width
        : wrapper.offsetWidth || wrapper.getBoundingClientRect().width;
      const slideDistance = Math.max(viewportWidth, wrapperWidth);

      const isNext = direction === "next";
      const outKeyframes = isNext
        ? [
            { transform: "translateX(0)" },
            { transform: `translateX(-${String(slideDistance)}px)` },
          ]
        : [
            { transform: "translateX(0)" },
            { transform: `translateX(${String(slideDistance)}px)` },
          ];
      const inKeyframes = isNext
        ? [
            { transform: `translateX(${String(slideDistance)}px)` },
            { transform: "translateX(0)" },
          ]
        : [
            { transform: `translateX(-${String(slideDistance)}px)` },
            { transform: "translateX(0)" },
          ];

      outgoing.animate(outKeyframes, {
        duration: SLIDE_DURATION_MS,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      });
      incoming
        .animate(inKeyframes, {
          duration: SLIDE_DURATION_MS,
          easing: "cubic-bezier(0, 0, 0.2, 1)",
          fill: "forwards",
        })
        .finished.then(() => {
          setPreviousIndex(null);
          setTransitionSize(null);
        })
        .catch((error: unknown) => {
          console.error(error);
        });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(runAnimation);
    });
  }, [previousIndex, direction, transitionSize]);

  // Sync currentIndex when opening with a new initialIndex; reset transition state
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), images.length - 1));
      setPreviousIndex(null);
      setTransitionSize(null);
    }
  }, [isOpen, initialIndex, images.length]);

  const captureAndGoPrev = useCallback(() => {
    if (previousIndex !== null) return;
    if (prefersReducedMotion()) {
      setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
      return;
    }
    const wrapper = wrapperRef.current;
    if (wrapper) {
      setTransitionSize({
        width: wrapper.offsetWidth,
        height: wrapper.offsetHeight,
      });
    }
    setDirection("prev");
    setPreviousIndex(currentIndex);
    setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  }, [images.length, currentIndex, previousIndex]);

  const captureAndGoNext = useCallback(() => {
    if (previousIndex !== null) return;
    if (prefersReducedMotion()) {
      setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
      return;
    }
    const wrapper = wrapperRef.current;
    if (wrapper) {
      setTransitionSize({
        width: wrapper.offsetWidth,
        height: wrapper.offsetHeight,
      });
    }
    setDirection("next");
    setPreviousIndex(currentIndex);
    setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
  }, [images.length, currentIndex, previousIndex]);

  useEffect(() => {
    if (!isOpen || images.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        captureAndGoPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        captureAndGoNext();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, images.length, captureAndGoPrev, captureAndGoNext]);

  if (images.length === 0) return null;

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger || <span {...stylex.props(styles.hiddenTrigger)} />}
      <ModalOverlay
        isDismissable
        {...stylex.props(styles.overlay, ui.overlay, style)}
      >
        <div
          {...stylex.props(styles.backdrop)}
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions */}
        <div
          {...stylex.props(styles.closeButton)}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton variant="tertiary" size="lg" label="Close" slot="close">
            <X size={24} />
          </IconButton>
        </div>
        <Modal
          {...stylex.props(styles.modal)}
          onClick={(e) => e.stopPropagation()}
        >
          <AriaDialog {...stylex.props(styles.dialog)} aria-label={alt}>
            {hasMultiple ? (
              <div {...stylex.props(styles.contentRow)}>
                <div {...stylex.props(styles.navButton, ui.textContrast)}>
                  <IconButton
                    variant="secondary"
                    size="lg"
                    label="Previous image"
                    onPress={captureAndGoPrev}
                  >
                    <ChevronLeft size={32} />
                  </IconButton>
                </div>

                <div
                  ref={wrapperRef}
                  {...stylex.props(styles.imageWrapper)}
                  style={
                    transitionSize
                      ? {
                          height: transitionSize.height,
                          width: transitionSize.width,
                        }
                      : undefined
                  }
                >
                  {previousIndex === null ? (
                    <img
                      src={currentImage}
                      alt={`${alt} ${String(currentIndex + 1)}`}
                      {...stylex.props(styles.image)}
                    />
                  ) : (
                    <>
                      <div
                        ref={outgoingRef}
                        {...stylex.props(
                          styles.imageLayer,
                          styles.imageLayerOutgoing,
                        )}
                      >
                        <img
                          src={images[previousIndex]}
                          alt=""
                          role="presentation"
                          {...stylex.props(styles.image)}
                        />
                      </div>
                      <div
                        ref={incomingRef}
                        {...stylex.props(
                          styles.imageLayer,
                          styles.imageLayerIncoming,
                        )}
                      >
                        <img
                          src={currentImage}
                          alt={`${alt} ${String(currentIndex + 1)}`}
                          {...stylex.props(styles.image)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div {...stylex.props(styles.navButton, ui.textContrast)}>
                  <IconButton
                    variant="secondary"
                    size="lg"
                    label="Next image"
                    onPress={captureAndGoNext}
                  >
                    <ChevronRight size={32} />
                  </IconButton>
                </div>
              </div>
            ) : (
              <div
                ref={wrapperRef}
                {...stylex.props(styles.imageWrapper)}
                style={
                  transitionSize
                    ? {
                        height: transitionSize.height,
                        width: transitionSize.width,
                      }
                    : undefined
                }
              >
                <img
                  src={currentImage}
                  alt={alt}
                  {...stylex.props(styles.image)}
                />
              </div>
            )}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
