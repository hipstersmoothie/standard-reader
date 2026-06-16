import {
  buildMagazinePalette,
  magazinePaletteCss,
  themePrefersDark,
} from "#/lib/collections/radix-theme";
import { Lightbox } from "#/design-system/lightbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MagIssue } from "./types";

import { MagazineColorContext } from "./context";
import { CoverFlow, EditorialFlow, EndCardFlow, FeatureFlow } from "./flow";
import { googleFontsHref, magazineThemeStyle } from "./theme-vars";
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

function readGeom(): Geom {
  const w = globalThis.window === undefined ? 1200 : globalThis.innerWidth;
  const h = globalThis.window === undefined ? 900 : globalThis.innerHeight;
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

export function Magazine({
  issue,
  onExit,
  onOpenReader,
}: {
  issue: MagIssue;
  onExit: () => void;
  onOpenReader: () => void;
}) {
  const storageKey = `mag-slide:${issue.name}`;
  const themePalette = useMemo(
    () => buildMagazinePalette(issue.theme),
    [issue.theme],
  );

  const [mounted, setMounted] = useState(false);
  const [geom, setGeom] = useState<Geom>(() => readGeom());
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [chrome, setChrome] = useState(false);
  const [toc, setToc] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [dark, setDark] = useState(false);

  const flowRef = useRef<HTMLDivElement | null>(null);
  const featureRefs = useRef<Array<HTMLElement | null>>([]);
  const restoredRef = useRef(false);
  const photoLightbox = useMagazineImageLightbox(flowRef);

  // Own the viewport while mounted.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    setMounted(true);
    setGeom(readGeom());
    setShowHint(!localStorage.getItem("mag-seen"));
    // Default to the theme's own mode until the reader explicitly toggles.
    const storedDark = localStorage.getItem("mag-dark");
    setDark(
      storedDark === null ? themePrefersDark(issue.theme) : storedDark === "1",
    );
    const t = setTimeout(() => setAnimate(true), 80);
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      clearTimeout(t);
    };
  }, [issue.theme]);

  useEffect(() => {
    const onResize = () => {
      const next = readGeom();
      setGeom((prev) =>
        prev.spread === next.spread &&
        prev.pageW === next.pageW &&
        prev.pageH === next.pageH
          ? prev
          : next,
      );
    };
    globalThis.addEventListener("resize", onResize);
    globalThis.addEventListener("orientationchange", onResize);
    return () => {
      globalThis.removeEventListener("resize", onResize);
      globalThis.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Measure the fragmented flow → column + slide counts and feature anchors.
  const runMeasure = useCallback(() => {
    const flow = flowRef.current;
    if (!flow) return;

    const pitch = geom.colW + geom.gap;
    if (pitch <= 0) return;
    const columns = Math.max(
      1,
      Math.round((flow.scrollWidth + geom.gap) / pitch),
    );
    const slideCount = Math.max(1, Math.ceil(columns / geom.perView));
    const flowLeft = flow.getBoundingClientRect().left;
    const featureCols = featureRefs.current.map((el) => {
      if (!el) return 0;
      const x = el.getBoundingClientRect().left - flowLeft;
      return Math.max(0, Math.round(x / pitch));
    });
    setMeasure((prev) =>
      prev &&
      prev.columns === columns &&
      prev.slideCount === slideCount &&
      prev.featureCols.length === featureCols.length &&
      prev.featureCols.every((c, i) => c === featureCols[i])
        ? prev
        : { columns, slideCount, featureCols },
    );
  }, [geom, issue.features.length]);

  // Re-measure after fonts + late images settle, and whenever geometry changes.
  const themeFontTitle = issue.theme?.fontTitle;
  const themeFontBody = issue.theme?.fontBody;
  useEffect(() => {
    setMeasure(null);
    let raf = 0;
    const passes: Array<ReturnType<typeof setTimeout>> = [];
    const schedule = () => {
      raf = requestAnimationFrame(runMeasure);
    };
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(schedule);
    } else {
      schedule();
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
      ).then(runMeasure);
    }
    for (const delay of [200, 600, 1500, 3000]) {
      passes.push(setTimeout(runMeasure, delay));
    }
    globalThis.addEventListener("load", runMeasure);
    return () => {
      cancelAnimationFrame(raf);
      for (const p of passes) clearTimeout(p);
      globalThis.removeEventListener("load", runMeasure);
    };
  }, [runMeasure, themeFontTitle, themeFontBody]);

  const slideCount = measure?.slideCount ?? 1;
  const maxSlide = Math.max(0, slideCount - 1);

  // Restore the saved slide once measured.
  useEffect(() => {
    if (restoredRef.current || !measure) return;
    restoredRef.current = true;
    const saved = Number.parseInt(localStorage.getItem(storageKey) ?? "", 10);
    if (Number.isFinite(saved)) setActiveSlide(clamp(saved, 0, maxSlide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

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
  }, []);

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
        if (toc) setToc(false);
        else onExit();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [go, maxSlide, onExit, photoLightbox.isOpen, toc, wake]);

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

  const stageStyle: React.CSSProperties = {
    paddingLeft: geom.hMargin,
    paddingRight: geom.hMargin,
    paddingTop: geom.vMargin,
    paddingBottom: geom.vMargin,
  };
  const flowStyle: React.CSSProperties = {
    columnWidth: `${geom.colW}px`,
    columnGap: `${geom.gap}px`,
    height: geom.pageH - 2 * geom.vMargin,
    transform: `translateX(${-activeSlide * geom.perView * geom.pageW}px)`,
  };

  const fontsHref = googleFontsHref(issue.theme);
  const paletteCss = themePalette ? magazinePaletteCss(themePalette) : null;

  return (
    <MagazineColorContext value={{ dark }}>
      <div
        className={`mag ${dark ? "is-dark" : ""} ${issue.theme ? "is-themed" : ""}`}
        style={{
          ...magazineThemeStyle(issue.theme),
          "--mag-click-zone-w": `${geom.hMargin}px`,
        }}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
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
        }}
      >
        {fontsHref ? <link rel="stylesheet" href={fontsHref} /> : null}
        {paletteCss ? (
          // eslint-disable-next-line react/no-danger
          <style dangerouslySetInnerHTML={{ __html: paletteCss }} />
        ) : null}
        <div className="progress" style={{ width: `${progress}%` }} />

        <div className="mag-stage" style={stageStyle}>
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
                    ref={(el) => {
                      featureRefs.current[i] = el;
                    }}
                  />
                ))}
                <EndCardFlow issue={issue} />
              </>
            ) : null}
          </div>
        </div>

        {measure === null ? (
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
            <span className="num">
              {String(leftFolio.num).padStart(2, "0")}
            </span>
            <span className="tick" />
            <span>{leftFolio.label}</span>
          </div>
        ) : null}
        {rightFolio ? (
          <div className="folio right">
            <span>{rightFolio.label}</span>
            <span className="tick" />
            <span className="num">
              {String(rightFolio.num).padStart(2, "0")}
            </span>
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

        <button
          className={`toc-btn ${chromeOn ? "show" : ""}`}
          onClick={() => setToc(true)}
        >
          <span className="mk">S</span>
          Contents
        </button>

        <button
          className={`reader-btn ${chromeOn ? "show" : ""}`}
          onClick={onOpenReader}
          aria-label="Switch to reader view"
        >
          Reader
        </button>

        <button
          className={`theme-btn ${chromeOn ? "show" : ""}`}
          onClick={toggleDark}
          aria-label={dark ? "Switch to light paper" : "Switch to dark paper"}
        >
          {dark ? Icon.sun : Icon.moon}
        </button>

        <button
          className={`exit-btn ${chromeOn ? "show" : ""}`}
          onClick={onExit}
          aria-label="Close magazine"
        >
          {Icon.close}
        </button>

        {showHint ? (
          <div className="hint">
            <span>
              <kbd>←</kbd> <kbd>→</kbd>
            </span>
            <span>turn the page</span>
          </div>
        ) : null}

        <div className={`dock ${chromeOn ? "show" : ""}`}>
          <button
            onClick={() => go(-1)}
            disabled={activeSlide <= 0 || photoLightbox.isOpen}
            aria-label="Previous"
          >
            {Icon.prev}
          </button>
          <div className="pos">
            <span className="ttl">{currentTitle}</span>
            <span>
              {activeSlide + 1} / {slideCount}
            </span>
          </div>
          <button
            onClick={() => go(1)}
            disabled={activeSlide >= maxSlide || photoLightbox.isOpen}
            aria-label="Next"
          >
            {Icon.next}
          </button>
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
            <div className="sub">
              {issue.sub} &nbsp;·&nbsp; {issue.features.length} features
            </div>
          </div>
          <div className="toc-list">
            {issue.features.map((feature, i) => {
              const col = measure?.featureCols[i] ?? 0;
              const num = Math.max(1, col - firstFeatureCol + 1);
              const active = featureForColumn(leftCol) === i;
              return (
                <button
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
                </button>
              );
            })}
          </div>
        </nav>
      </div>
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
