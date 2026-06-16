import {
  buildMagazinePalette,
  magazinePaletteCss,
  themePrefersDark,
} from "#/lib/collections/radix-theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MagIssue } from "./types";

import { CoverFlow, EditorialFlow, EndCardFlow, FeatureFlow } from "./flow";
import { MagazineColorContext } from "./context";
import { googleFontsHref, magazineThemeStyle } from "./theme-vars";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Normalize to origin+path so CDN/query variants of one image compare equal. */
function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

/** Whether two image URLs point at the same asset (same path or blob CID). */
function sameImageUrl(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeImageUrl(a);
  const nb = normalizeImageUrl(b);
  if (na === nb) return true;
  const sa = na.split("/").pop() ?? "";
  const sb = nb.split("/").pop() ?? "";
  return sa.length > 8 && sa === sb;
}

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
  const w = typeof window === "undefined" ? 1200 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
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

/** Matches `.mag .click-zone { width: 14vw }` in magazine.css */
const CLICK_ZONE_VW = 0.14;
/** Ignore synthetic mouse events fired after touch (edge tap, swipe). */
const POST_TOUCH_MOUSE_MS = 500;

function isEdgeTap(clientX: number) {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const edge = width * CLICK_ZONE_VW;
  return clientX <= edge || clientX >= width - edge;
}

export function Magazine({
  issue,
  onExit,
}: {
  issue: MagIssue;
  onExit: () => void;
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

  // Covers promoted from a leading body image (index → resolved url, or null
  // once inspected and ruled out). `coversRef` is the live copy used during a
  // measure pass; `covers` mirrors it into render state.
  const coversRef = useRef<Record<number, string | null>>({});
  const [covers, setCovers] = useState<Record<number, string | null>>({});
  const effectiveCover = (i: number): string | null =>
    issue.features[i]?.meta.coverImageUrl ?? covers[i] ?? null;

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
  }, []);

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
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Measure the fragmented flow → column + slide counts and feature anchors.
  const runMeasure = useCallback(() => {
    const flow = flowRef.current;
    if (!flow) return;

    const bodies = flow.querySelectorAll<HTMLElement>(".feature-body");
    let coversChanged = false;
    issue.features.forEach((feature, i) => {
      const body = bodies[i];
      if (!body) return;

      // Promote a leading body image to the cover when there's no explicit one.
      let cover = feature.meta.coverImageUrl ?? coversRef.current[i] ?? null;
      if (!feature.meta.coverImageUrl && coversRef.current[i] === undefined) {
        const wrapper = body.children[1]; // [0] is the opener header
        const firstBlock = wrapper?.firstElementChild as HTMLElement | null;
        const img = firstBlock?.querySelector<HTMLImageElement>("img") ?? null;
        const isImageBlock =
          !!img &&
          !!firstBlock &&
          firstBlock.tagName !== "P" &&
          firstBlock.getBoundingClientRect().height > 120;
        const promoted = isImageBlock ? img.currentSrc || img.src : null;
        coversRef.current[i] = promoted;
        cover = promoted;
        coversChanged = true;
      }

      // If the cover image is also the first body image, hide the in-body copy
      // so the photo appears once — as the cover opener.
      if (cover && body.dataset.dedup !== "done") {
        const img = body.querySelector<HTMLImageElement>("img");
        const src = img ? img.currentSrc || img.src : "";
        if (img && src && sameImageUrl(src, cover)) {
          (img.closest("figure") ?? img).style.display = "none";
          body.dataset.dedup = "done";
        }
      }
    });
    if (coversChanged) setCovers({ ...coversRef.current });

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
  }, [geom, issue]);

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
    const families = [themeFontTitle, themeFontBody].filter((f): f is string =>
      Boolean(f),
    );
    if (typeof document !== "undefined" && document.fonts && families.length) {
      void Promise.all(
        families.map((family) =>
          document.fonts.load(`1em "${family}"`).catch(() => []),
        ),
      ).then(runMeasure);
    }
    for (const delay of [200, 600, 1500, 3000]) {
      passes.push(setTimeout(runMeasure, delay));
    }
    window.addEventListener("load", runMeasure);
    return () => {
      cancelAnimationFrame(raf);
      for (const p of passes) clearTimeout(p);
      window.removeEventListener("load", runMeasure);
    };
  }, [runMeasure, themeFontTitle, themeFontBody]);

  // A promoted cover changes the flow structure → re-measure once it lands.
  useEffect(() => {
    runMeasure();
  }, [covers, runMeasure]);

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
      if (isEdgeTap(e.clientX)) return;
      wake();
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [wake]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, maxSlide, toc, onExit, wake]);

  // Swipe.
  const touchX = useRef<number | null>(null);

  const featureForColumn = useCallback(
    (col: number) => {
      if (!measure) return -1;
      let found = -1;
      measure.featureCols.forEach((start, i) => {
        if (start <= col) found = i;
      });
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
        style={magazineThemeStyle(issue.theme)}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          lastTouchEnd.current = Date.now();
          if (touchX.current == null) return;
          const startX = touchX.current;
          const dx = e.changedTouches[0].clientX - startX;
          touchX.current = null;
          if (Math.abs(dx) > 44) {
            suppressWake();
            go(dx < 0 ? 1 : -1);
            return;
          }
          if (isEdgeTap(startX)) {
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
                    coverImageUrl={effectiveCover(i)}
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
          <div className="building">
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
          disabled={activeSlide <= 0}
          aria-label="Previous page"
          tabIndex={-1}
        />
        <button
          className="click-zone next"
          onPointerDown={() => suppressWake()}
          onClick={() => go(1)}
          disabled={activeSlide >= maxSlide}
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
            disabled={activeSlide <= 0}
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
            disabled={activeSlide >= maxSlide}
            aria-label="Next"
          >
            {Icon.next}
          </button>
        </div>

        <div
          className={`toc-scrim ${toc ? "open" : ""}`}
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
    </MagazineColorContext>
  );
}
