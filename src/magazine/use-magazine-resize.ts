import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";

import type { Geom } from "./magazine-geom";
import {
  captureResizeAnchor,
  featureIndexAtColumn,
  slideForAnchor,
  type FlowMeasure,
  type ResizeAnchor,
} from "./magazine-measure";
import {
  beginResizeChrome,
  endResizeChrome,
  snapResizeChromeTransform,
} from "./resize-chrome";

export const RESIZE_SETTLE_MS = 180;
const RESTORE_MAX_ATTEMPTS = 12;

export type { ResizeAnchor };

export function useMagazineResize({
  enabled,
  resetKey,
  chromeRootRef,
  geom,
  activeSlide,
  measure,
  setActiveSlide,
  measureNow,
  commitMeasure,
  suppressPageTurn,
  resumePageTurn,
}: {
  enabled: boolean;
  resetKey: string;
  chromeRootRef: RefObject<HTMLElement | null>;
  geom: Geom;
  activeSlide: number;
  measure: FlowMeasure | null;
  setActiveSlide: Dispatch<SetStateAction<number>>;
  measureNow: () => FlowMeasure | null;
  commitMeasure: (snapshot: FlowMeasure) => void;
  suppressPageTurn: () => void;
  resumePageTurn: () => void;
}) {
  const [layoutLocked, setLayoutLocked] = useState(false);
  const [frozenTransformPx, setFrozenTransformPx] = useState<number | null>(
    null,
  );

  const hasSizedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<ResizeAnchor | null>(null);

  const geomRef = useRef(geom);
  const activeSlideRef = useRef(activeSlide);
  const measureRef = useRef(measure);

  geomRef.current = geom;
  activeSlideRef.current = activeSlide;
  measureRef.current = measure;

  const revealAfterSnap = useCallback(() => {
    requestAnimationFrame(() => {
      endResizeChrome(chromeRootRef.current);
      requestAnimationFrame(resumePageTurn);
    });
  }, [chromeRootRef, resumePageTurn]);

  const finishWithoutRestore = useCallback(() => {
    flushSync(() => {
      suppressPageTurn();
      setLayoutLocked(false);
      setFrozenTransformPx(null);
    });
    revealAfterSnap();
  }, [revealAfterSnap, suppressPageTurn]);

  const scheduleSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const anchor = anchorRef.current;
      anchorRef.current = null;

      if (!anchor) {
        finishWithoutRestore();
        return;
      }

      let attempt = 0;
      const restore = () => {
        attempt += 1;
        const fresh = measureNow();
        if (!fresh) {
          if (attempt < RESTORE_MAX_ATTEMPTS) {
            requestAnimationFrame(restore);
            return;
          }
          finishWithoutRestore();
          return;
        }

        const slide = slideForAnchor(anchor, geomRef.current, fresh);
        if (anchor.featureIndex >= 0) {
          const restoredCol = slide * geomRef.current.perView;
          const restoredFeature = featureIndexAtColumn(
            restoredCol,
            fresh.featureCols,
          );
          if (
            restoredFeature !== anchor.featureIndex &&
            attempt < RESTORE_MAX_ATTEMPTS
          ) {
            requestAnimationFrame(restore);
            return;
          }
        }

        const translatePx =
          -slide * geomRef.current.perView * geomRef.current.pageW;

        flushSync(() => {
          suppressPageTurn();
          commitMeasure(fresh);
          setActiveSlide(slide);
          setLayoutLocked(false);
          setFrozenTransformPx(null);
        });
        snapResizeChromeTransform(chromeRootRef.current, translatePx);
        revealAfterSnap();
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(restore);
      });
    }, RESIZE_SETTLE_MS);
  }, [
    chromeRootRef,
    commitMeasure,
    finishWithoutRestore,
    measureNow,
    revealAfterSnap,
    setActiveSlide,
    suppressPageTurn,
  ]);

  /** Call inside flushSync before geom updates when the stage box changed. */
  const onStageSizeChange = useCallback((): boolean => {
    if (!enabled) return false;

    if (!hasSizedRef.current) {
      hasSizedRef.current = true;
      return false;
    }

    const currentMeasure = measureRef.current;
    const currentGeom = geomRef.current;
    const currentSlide = activeSlideRef.current;
    if (!currentMeasure) return false;

    suppressPageTurn();
    beginResizeChrome(chromeRootRef.current);

    if (!anchorRef.current) {
      anchorRef.current = captureResizeAnchor(
        currentSlide,
        currentGeom,
        currentMeasure.featureCols,
      );
      setFrozenTransformPx(
        -currentSlide * currentGeom.perView * currentGeom.pageW,
      );
    }

    setLayoutLocked(true);
    return true;
  }, [chromeRootRef, enabled, suppressPageTurn]);

  // Show the overlay synchronously on viewport resize — before the stage
  // ResizeObserver and React geom commit can paint a reflow frame.
  useLayoutEffect(() => {
    if (!enabled) return;

    const onEarlyResize = () => {
      suppressPageTurn();
      beginResizeChrome(chromeRootRef.current);
      scheduleSettle();
    };

    globalThis.addEventListener("resize", onEarlyResize);
    globalThis.visualViewport?.addEventListener("resize", onEarlyResize);
    return () => {
      globalThis.removeEventListener("resize", onEarlyResize);
      globalThis.visualViewport?.removeEventListener("resize", onEarlyResize);
    };
  }, [chromeRootRef, enabled, scheduleSettle, suppressPageTurn]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    hasSizedRef.current = false;
    anchorRef.current = null;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    endResizeChrome(chromeRootRef.current);
    setLayoutLocked(false);
    setFrozenTransformPx(null);
  }, [chromeRootRef, resetKey]);

  return { layoutLocked, frozenTransformPx, onStageSizeChange, scheduleSettle };
}
