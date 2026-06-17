import { Lightbox } from "#/design-system/lightbox";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { MagIssue } from "./types";

import { MagazineColorContext } from "./context";
import { readMagazineDark } from "./dark-mode";
import { CoverFlow, EditorialFlow, EndCardFlow, FeatureFlow } from "./flow";
import { MagHoverButton } from "./mag-hover-button";
import { MagazineShell } from "./magazine-shell";
import { useMagazineImageLightbox } from "./use-magazine-image-lightbox";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const Icon = {
  prev: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  next: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  close: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  sun: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

interface Geom {
  spread: boolean;
  perView: number;
  pageW: number;
  pageH: number;
  hMargin: number;
  vMargin: number;
  colW: number;
  gap: number;
}

function readGeom(width: number, height: number): Geom {
  const w = width;
  const h = height;
  const spread = w >= 760 && w > h;
  const perView = spread ? 2 : 1;
  const pageW = w / perView;
  const hMargin = Math.round(clamp(pageW * 0.08, 24, 96));
  const vMargin = Math.round(clamp(h * 0.07, 28, 110));
  return {
    spread,
    perView,
    pageW,
    pageH: h,
    hMargin,
    vMargin,
    colW: pageW - 2 * hMargin,
    gap: 2 * hMargin,
  };
}

interface Measure {
  slideCount: number;
  columns: number;
  featureCols: Array<number>;
}

/** Matches `.mag .click-zone { width: var(--mag-click-zone-w) }` from stage margins. */
function isEdgeTap(clientX: number, edgeWidth: number) {
  const width = globalThis.visualViewport?.width ?? globalThis.innerWidth;
  return clientX <= edgeWidth || clientX >= width - edgeWidth;
}

/** Ignore synthetic mouse events fired after touch (edge tap, swipe). */
const POST_TOUCH_MOUSE_MS = 500;

/** Matches `.mag-flow.animate { transition: transform 0.46s ... }`. */
const PAGE_TURN_MS = 460;

function imgOpenerColForSlide(
  slide: number,
  perView: number,
  spread: boolean,
  measure: Measure | null,
  features: MagIssue["features"],
): number | null {
  if (spread || !measure) return null;
  const col = slide * perView;
  for (let i = 0; i < features.length; i++) {
    if (features[i].meta.coverImageUrl && measure.featureCols[i] === col) {
      return col;
    }
  }
  return null;
}

export function Magazine({
  issue,
  onExit,
  onOpenReader,
  embedded = false,
  dark: darkProp,
  onDarkChange,
}: {
  issue: MagIssue;
  onExit: () => void;
  onOpenReader: () => void;
  /** When true, render inside a parent {@link MagazineShell}. */
  embedded?: boolean;
  dark?: boolean;
  onDarkChange?: Dispatch<SetStateAction<boolean>>;
}) {
  const storageKey = `mag-slide:${issue.name}`;

  const [mounted, setMounted] = useState(false);
  const [geom, setGeom] = useState<Geom>(() => readGeom(390, 844));
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [fullBleedCol, setFullBleedCol] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);
  const [chrome, setChrome] = useState(false);
  const [toc, setToc] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [darkInternal, setDarkInternal] = useState(() =>
    readMagazineDark(issue.theme),
  );
  const dark = darkProp ?? darkInternal;
  const setDark = onDarkChange ?? setDarkInternal;

  const flowRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const featureRefs = useRef<Array<HTMLElement | null>>([]);
  const endRef = useRef<HTMLElement | null>(null);
  const restoredRef = useRef(false);
  const measureRafRef = useRef(0);
  const lastScrollWidthRef = useRef(0);
  const activeSlideRef = useRef(activeSlide);
  const bleedClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoLightbox = useMagazineImageLightbox(flowRef);

  activeSlideRef.current = activeSlide;

  const syncFullBleedCol = useCallback(() => {
    setFullBleedCol(
      imgOpenerColForSlide(
        activeSlideRef.current,
        geom.perView,
        geom.spread,
        measure,
        issue.features,
      ),
    );
  }, [geom.perView, geom.spread, issue.features, measure]);

  // Hold full-bleed openers through the page-turn animation when leaving them.
  useEffect(() => {
    const openerCol = imgOpenerColForSlide(
      activeSlide,
      geom.perView,
      geom.spread,
      measure,
      issue.features,
    );
    if (bleedClearTimerRef.current) {
      clearTimeout(bleedClearTimerRef.current);
      bleedClearTimerRef.current = null;
    }
    if (openerCol !== null) {
      setFullBleedCol(openerCol);
      return;
    }
    if (!animate) {
      setFullBleedCol(null);
      return;
    }
    bleedClearTimerRef.current = setTimeout(() => {
      bleedClearTimerRef.current = null;
      syncFullBleedCol();
    }, PAGE_TURN_MS);
  }, [
    activeSlide,
    animate,
    geom.perView,
    geom.spread,
    issue.features,
    measure,
    syncFullBleedCol,
  ]);

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || !animate) return;

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== flow || event.propertyName !== "transform") return;
      if (bleedClearTimerRef.current) {
        clearTimeout(bleedClearTimerRef.current);
        bleedClearTimerRef.current = null;
      }
      syncFullBleedCol();
    };

    flow.addEventListener("transitionend", onTransitionEnd);
    return () => flow.removeEventListener("transitionend", onTransitionEnd);
  }, [animate, syncFullBleedCol]);

  useEffect(
    () => () => {
      if (bleedClearTimerRef.current) clearTimeout(bleedClearTimerRef.current);
    },
    [],
  );

  // Own the viewport while mounted (shell handles overflow when embedded).
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = embedded ? null : html.style.overflow;
    const prevBody = embedded ? null : body.style.overflow;
    if (!embedded) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    }
    setMounted(true);
    setShowHint(!localStorage.getItem("mag-seen"));
    if (!onDarkChange) {
      setDarkInternal(readMagazineDark(issue.theme));
    }
    const t = setTimeout(() => setAnimate(true), 80);
    return () => {
      if (!embedded && prevHtml !== null && prevBody !== null) {
        html.style.overflow = prevHtml;
        body.style.overflow = prevBody;
      }
      clearTimeout(t);
    };
  }, [embedded, issue.theme, onDarkChange]);

  // Page geometry follows the painted stage box (ResizeObserver), not viewport
  // units — iOS Safari can report innerHeight/dvh larger than the visible area.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || globalThis.ResizeObserver === undefined) return;

    const syncGeom = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w <= 0 || h <= 0) return;
      const next = readGeom(w, h);
      setGeom((prev) =>
        prev.spread === next.spread &&
        prev.pageW === next.pageW &&
        prev.pageH === next.pageH &&
        prev.hMargin === next.hMargin &&
        prev.vMargin === next.vMargin
          ? prev
          : next,
      );
    };

    syncGeom();
    const observer = new ResizeObserver(syncGeom);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mounted]);

  // Measure the fragmented flow → column + slide counts and feature anchors.
  const runMeasure = useCallback(() => {
    const flow = flowRef.current;
    if (!flow) return;

    const pitch = geom.colW + geom.gap;
    if (pitch <= 0) return;
    const flowLeft = flow.getBoundingClientRect().left;
    const columnAt = (el: HTMLElement | null) => {
      if (!el) return null;
      const x = el.getBoundingClientRect().left - flowLeft;
      return Math.max(0, Math.round(x / pitch));
    };
    const columnSpanEnd = (el: HTMLElement | null) => {
      if (!el) return null;
      const x = el.getBoundingClientRect().right - flowLeft;
      return Math.max(0, Math.ceil(x / pitch) - 1);
    };
    // scrollWidth is the source of truth for total flowed columns. clientWidth /
    // ResizeObserver stay fixed while columns accrue, so callers must re-run this
    // when async content (images, fonts, end-spread widgets) settles.
    let columns = Math.max(
      1,
      Math.ceil((flow.scrollWidth + geom.gap - 1) / pitch),
    );
    const endEl = endRef.current;
    const endStartCol = columnAt(endEl);
    const endSpanCol = columnSpanEnd(endEl);
    if (mounted && !endEl) return;

    const endAnchorCol =
      endStartCol != null
        ? Math.max(endStartCol, endSpanCol ?? endStartCol)
        : null;
    if (endAnchorCol != null) {
      // Spread: end column + facing page. Single: end column only (perView = 1).
      columns = Math.max(columns, endAnchorCol + geom.perView);
    }
    let slideCount = Math.max(1, Math.ceil(columns / geom.perView));
    if (endStartCol != null) {
      slideCount = Math.max(
        slideCount,
        Math.floor(endStartCol / geom.perView) + 1,
      );
    }
    lastScrollWidthRef.current = flow.scrollWidth;
    const featureCols = featureRefs.current.map((el) => columnAt(el) ?? 0);
    setMeasure((prev) =>
      prev &&
      prev.columns === columns &&
      prev.slideCount === slideCount &&
      prev.featureCols.length === featureCols.length &&
      prev.featureCols.every((c, i) => c === featureCols[i])
        ? prev
        : { columns, slideCount, featureCols },
    );
  }, [
    geom,
    issue.documentUri,
    issue.features.length,
    issue.subscribe?.uri,
    mounted,
  ]);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(measureRafRef.current);
    measureRafRef.current = requestAnimationFrame(runMeasure);
  }, [runMeasure]);

  const setEndRef = useCallback(
    (el: HTMLElement | null) => {
      endRef.current = el;
      if (el) scheduleMeasure();
    },
    [scheduleMeasure],
  );

  // Reset pagination when the issue changes.
  useEffect(() => {
    setMeasure(null);
    restoredRef.current = false;
    lastScrollWidthRef.current = 0;
  }, [issue.name, issue.features.length]);

  // Re-measure after fonts + late images settle, and whenever geometry changes.
  const themeFontTitle = issue.theme?.fontTitle;
  const themeFontBody = issue.theme?.fontBody;
  useEffect(() => {
    const passes: Array<ReturnType<typeof setTimeout>> = [];
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(scheduleMeasure);
    } else {
      scheduleMeasure();
    }
    // Custom Google fonts load lazily after their <link> is added, so
    // `fonts.ready` can resolve before they arrive and pagination ends up
    // measured with the fallback font. Explicitly load each theme font at the
    // weights the magazine uses and re-measure once the real metrics are in.
    const families = [themeFontTitle, themeFontBody].filter(
      Boolean,
    ) as Array<string>;
    if (
      typeof document !== "undefined" &&
      document.fonts &&
      families.length > 0
    ) {
      void Promise.all(
        families.map((family) =>
          document.fonts.load(`1em "${family}"`).catch(() => []),
        ),
      ).then(scheduleMeasure);
    }
    for (const delay of [200, 600, 1500, 3000, 6000, 10000]) {
      passes.push(setTimeout(scheduleMeasure, delay));
    }
    globalThis.addEventListener("load", scheduleMeasure);
    return () => {
      for (const p of passes) clearTimeout(p);
      globalThis.removeEventListener("load", scheduleMeasure);
    };
  }, [scheduleMeasure, themeFontTitle, themeFontBody, mounted]);

  // Measure synchronously after commit so end-card refs are attached before rAF.
  useLayoutEffect(() => {
    if (!mounted) return;
    runMeasure();
  }, [mounted, runMeasure]);

  // Async content grows scrollWidth without changing clientWidth, so
  // ResizeObserver alone misses new columns. Poll + DOM/image hooks catch it.
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || !mounted) return;

    const onImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) scheduleMeasure();
    };
    flow.addEventListener("load", onImageLoad, true);

    let mutationObserver: MutationObserver | undefined;
    if (globalThis.MutationObserver !== undefined) {
      mutationObserver = new MutationObserver(scheduleMeasure);
      mutationObserver.observe(flow, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    let resizeObserver: ResizeObserver | undefined;
    if (globalThis.ResizeObserver !== undefined) {
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(flow);
    }

    // scrollWidth accrues as columns fragment; clientWidth stays one page wide.
    const poll = setInterval(() => {
      const el = flowRef.current;
      if (!el) return;
      if (el.scrollWidth !== lastScrollWidthRef.current) scheduleMeasure();
    }, 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 20_000);

    return () => {
      flow.removeEventListener("load", onImageLoad, true);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [mounted, scheduleMeasure, issue.documentUri, issue.subscribe?.uri]);

  const slideCount = measure?.slideCount ?? 1;
  const maxSlide = Math.max(0, slideCount - 1);

  // Restore the saved slide once measured.
  useEffect(() => {
    if (restoredRef.current || !measure) return;
    restoredRef.current = true;
    const saved = Number.parseInt(localStorage.getItem(storageKey) ?? "", 10);
    const slideMax = Math.max(0, measure.slideCount - 1);
    if (Number.isFinite(saved)) setActiveSlide(clamp(saved, 0, slideMax));
  }, [measure, storageKey]);

  useEffect(() => {
    setActiveSlide((s) => clamp(s, 0, maxSlide));
  }, [maxSlide]);

  useEffect(() => {
    if (measure) localStorage.setItem(storageKey, String(activeSlide));
  }, [activeSlide, measure, storageKey]);

  const dismissHint = useCallback(() => {
    setShowHint((prev) => {
      if (prev) localStorage.setItem("mag-seen", "1");
      return false;
    });
  }, []);

  const go = useCallback(
    (dir: number) => {
      dismissHint();
      setActiveSlide((s) => clamp(s + dir, 0, maxSlide));
    },
    [maxSlide, dismissHint],
  );

  const jumpToColumn = useCallback(
    (col: number) => {
      dismissHint();
      setActiveSlide(clamp(Math.floor(col / geom.perView), 0, maxSlide));
      setToc(false);
    },
    [geom.perView, maxSlide, dismissHint],
  );

  const jumpToFeature = useCallback(
    (featureIndex: number) => {
      jumpToColumn(measure?.featureCols[featureIndex] ?? 0);
    },
    [jumpToColumn, measure],
  );

  const toggleDark = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("mag-dark", next ? "1" : "0");
      return next;
    });
  }, [setDark]);

  // Auto-hiding HUD — pointer/tap or Tab, never on keyboard or swipe page turns.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressWakeUntil = useRef(0);
  const lastTouchEnd = useRef(0);
  const suppressWake = useCallback((ms = POST_TOUCH_MOUSE_MS) => {
    suppressWakeUntil.current = Date.now() + ms;
  }, []);
  const wake = useCallback(() => {
    if (Date.now() < suppressWakeUntil.current) return;
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 2800);
  }, []);

  const dismissChrome = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setChrome(false);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd.current < POST_TOUCH_MOUSE_MS) return;
      if (now < suppressWakeUntil.current) return;
      if (isEdgeTap(e.clientX, geom.hMargin)) return;
      wake();
    };
    globalThis.addEventListener("mousemove", onMove);
    return () => {
      globalThis.removeEventListener("mousemove", onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [wake, geom.hMargin]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (photoLightbox.isOpen) return;
      if (e.key === "Tab") {
        wake();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") {
        setActiveSlide(0);
      } else if (e.key === "End") {
        setActiveSlide(maxSlide);
      } else if (e.key.toLowerCase() === "t") {
        setToc((v) => !v);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (toc) {
          setToc(false);
        } else if (chrome) {
          dismissChrome();
        } else if (showHint) {
          dismissHint();
        }
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [
    chrome,
    dismissChrome,
    dismissHint,
    go,
    maxSlide,
    photoLightbox.isOpen,
    showHint,
    toc,
    wake,
  ]);

  // Swipe.
  const touchX = useRef<number | null>(null);

  const featureForColumn = useCallback(
    (col: number) => {
      if (!measure) return -1;
      let found = -1;
      for (let i = 0; i < measure.featureCols.length; i++) {
        const start = measure.featureCols[i];
        if (start <= col) found = i;
      }
      return found;
    },
    [measure],
  );

  const firstFeatureCol = measure?.featureCols[0] ?? 0;
  const chromeOn = chrome || toc;
  const progress = slideCount > 0 ? ((activeSlide + 1) / slideCount) * 100 : 0;

  const leftCol = activeSlide * geom.perView;
  const rightCol = leftCol + 1;
  const folioFor = (col: number) => {
    if (col < firstFeatureCol || col >= (measure?.columns ?? 0)) return null;
    const featureIdx = featureForColumn(col);
    if (featureIdx < 0) return null;
    return {
      num: col - firstFeatureCol + 1,
      label: issue.features[featureIdx]?.meta.pubName ?? issue.name,
    };
  };
  const leftFolio = folioFor(leftCol);
  const rightFolio = geom.spread ? folioFor(rightCol) : null;

  const currentTitle = (() => {
    const idx = featureForColumn(leftCol);
    return idx >= 0 ? issue.features[idx]?.meta.title : issue.name;
  })();

  const stageStyle = {
    paddingLeft: geom.hMargin,
    paddingRight: geom.hMargin,
    paddingTop: geom.vMargin,
    paddingBottom: geom.vMargin,
    "--mag-h-margin": `${geom.hMargin}px`,
    "--mag-v-margin": `${geom.vMargin}px`,
  } as React.CSSProperties;
  const flowStyle: React.CSSProperties = {
    columnWidth: `${geom.colW}px`,
    columnGap: `${geom.gap}px`,
    height: geom.pageH - 2 * geom.vMargin,
    transform: `translateX(${-activeSlide * geom.perView * geom.pageW}px)`,
  };

  const showBuilding = measure === null || !mounted;
  const [stagePainted, setStagePainted] = useState(false);

  useLayoutEffect(() => {
    if (showBuilding) {
      setStagePainted(false);
      return;
    }
    const id = requestAnimationFrame(() => setStagePainted(true));
    return () => cancelAnimationFrame(id);
  }, [showBuilding]);

  const revealStage = !showBuilding && (!embedded || stagePainted);
  const showBuildingOverlay = showBuilding || (embedded && !stagePainted);

  const shellStyle = {
    "--mag-click-zone-w": `${geom.hMargin}px`,
  } as React.CSSProperties;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouchEnd.current = Date.now();
    if (photoLightbox.isOpen) return;
    if (touchX.current == null) return;
    const startX = touchX.current;
    const dx = e.changedTouches[0].clientX - startX;
    touchX.current = null;
    if (Math.abs(dx) > 44) {
      suppressWake();
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (isEdgeTap(startX, geom.hMargin)) {
      suppressWake();
      return;
    }
    wake();
  };

  const viewer = (
    <>
      <div className="progress" style={{ width: `${progress}%` }} />

      <div
        className="mag-stage"
        ref={stageRef}
        style={{
          ...stageStyle,
          visibility: revealStage ? "visible" : "hidden",
        }}
      >
        {geom.spread && measure && measure.columns >= 2 ? (
          <div
            className={`creases ${animate ? "animate" : ""}`}
            aria-hidden
            style={{
              left: 0,
              top: 0,
              bottom: 0,
              // Only span full two-page spreads, so a trailing lone page (odd
              // column count) doesn't get a crease through its blank facing page.
              width: Math.floor(measure.columns / 2) * 2 * geom.pageW,
              backgroundSize: `${2 * geom.pageW}px 100%`,
              transform: `translateX(${-activeSlide * geom.perView * geom.pageW}px)`,
            }}
          />
        ) : null}
        <div
          className={`mag-flow ${animate ? "animate" : ""} ${
            geom.spread ? "spread" : "single"
          }`}
          ref={flowRef}
          style={flowStyle}
        >
          {mounted ? (
            <>
              <CoverFlow issue={issue} onJump={jumpToFeature} />
              <EditorialFlow issue={issue} />
              {issue.features.map((feature, i) => (
                <FeatureFlow
                  key={feature.meta.id}
                  feature={feature}
                  coverImageUrl={feature.meta.coverImageUrl}
                  fullBleed={
                    !geom.spread &&
                    Boolean(feature.meta.coverImageUrl) &&
                    fullBleedCol !== null &&
                    measure?.featureCols[i] === fullBleedCol
                  }
                  ref={(el) => {
                    featureRefs.current[i] = el;
                  }}
                />
              ))}
              <EndCardFlow issue={issue} ref={setEndRef} />
            </>
          ) : null}
        </div>
      </div>

      {showBuildingOverlay ? (
        <div
          className="building"
          aria-busy="true"
          aria-label="Setting the issue"
        >
          <div>
            <div className="spin" />
            Setting the issue…
          </div>
        </div>
      ) : null}

      {/* folios */}
      {leftFolio ? (
        <div className="folio left">
          <span className="num">{String(leftFolio.num).padStart(2, "0")}</span>
          <span className="tick" />
          <span>{leftFolio.label}</span>
        </div>
      ) : null}
      {rightFolio ? (
        <div className="folio right">
          <span>{rightFolio.label}</span>
          <span className="tick" />
          <span className="num">{String(rightFolio.num).padStart(2, "0")}</span>
        </div>
      ) : null}

      <button
        className="click-zone prev"
        onPointerDown={() => suppressWake()}
        onClick={() => go(-1)}
        disabled={activeSlide <= 0 || photoLightbox.isOpen}
        aria-label="Previous page"
        tabIndex={-1}
      />
      <button
        className="click-zone next"
        onPointerDown={() => suppressWake()}
        onClick={() => go(1)}
        disabled={activeSlide >= maxSlide || photoLightbox.isOpen}
        aria-label="Next page"
        tabIndex={-1}
      />

      <MagHoverButton
        className={`toc-btn ${chromeOn ? "show" : ""}`}
        onClick={() => setToc(true)}
      >
        <span className="mk">S</span>
        Contents
      </MagHoverButton>

      <MagHoverButton
        className={`reader-btn ${chromeOn ? "show" : ""}`}
        onClick={onOpenReader}
        aria-label="Switch to reader view"
      >
        Reader
      </MagHoverButton>

      <MagHoverButton
        className={`theme-btn ${chromeOn ? "show" : ""}`}
        onClick={toggleDark}
        aria-label={dark ? "Switch to light paper" : "Switch to dark paper"}
      >
        {dark ? Icon.sun : Icon.moon}
      </MagHoverButton>

      <MagHoverButton
        className={`exit-btn ${chromeOn ? "show" : ""}`}
        onClick={onExit}
        aria-label="Close magazine"
      >
        {Icon.close}
      </MagHoverButton>

      {showHint ? (
        <div className="hint">
          <span>
            <kbd>←</kbd> <kbd>→</kbd>
          </span>
          <span>turn the page</span>
        </div>
      ) : null}

      <div className={`dock ${chromeOn ? "show" : ""}`}>
        <MagHoverButton
          onClick={() => go(-1)}
          disabled={activeSlide <= 0 || photoLightbox.isOpen}
          aria-label="Previous"
        >
          {Icon.prev}
        </MagHoverButton>
        <div className="pos">
          <span className="ttl">{currentTitle}</span>
          <span>
            {activeSlide + 1} / {slideCount}
          </span>
        </div>
        <MagHoverButton
          onClick={() => go(1)}
          disabled={activeSlide >= maxSlide || photoLightbox.isOpen}
          aria-label="Next"
        >
          {Icon.next}
        </MagHoverButton>
      </div>

      <button
        type="button"
        className={`toc-scrim ${toc ? "open" : ""}`}
        aria-label="Close table of contents"
        onClick={() => setToc(false)}
      />
      <nav className={`toc ${toc ? "open" : ""}`}>
        <div className="toc-head">
          <div className="iss">
            {issue.name} &nbsp;·&nbsp; {issue.no}
          </div>
          <h2>Contents</h2>
          <div className="sub">{issue.features.length} features</div>
        </div>
        <div className="toc-list">
          {issue.features.map((feature, i) => {
            const col = measure?.featureCols[i] ?? 0;
            const num = Math.max(1, col - firstFeatureCol + 1);
            const active = featureForColumn(leftCol) === i;
            return (
              <MagHoverButton
                key={feature.meta.id}
                className={`toc-row ${active ? "on" : ""}`}
                onClick={() => jumpToColumn(col)}
              >
                <span className="pg-n">{String(num).padStart(2, "0")}</span>
                <span className="ti">
                  <span className="k">
                    {feature.meta.pubName} · {feature.meta.topic}
                  </span>
                  <span className="t">{feature.meta.title}</span>
                </span>
                <span className="mins">{feature.meta.minutes}m</span>
              </MagHoverButton>
            );
          })}
        </div>
      </nav>
    </>
  );

  return (
    <MagazineColorContext value={{ dark }}>
      {embedded ? (
        <div
          style={{
            ...shellStyle,
            position: "absolute",
            inset: 0,
            overflow: "hidden",
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {viewer}
        </div>
      ) : (
        <MagazineShell
          theme={issue.theme}
          dark={dark}
          style={shellStyle}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {viewer}
        </MagazineShell>
      )}
      <Lightbox
        isOpen={photoLightbox.isOpen}
        onOpenChange={photoLightbox.setIsOpen}
        images={photoLightbox.images}
        initialIndex={photoLightbox.initialIndex}
        alt="Image"
        style={{ zIndex: 1100 }}
      />
    </MagazineColorContext>
  );
}
