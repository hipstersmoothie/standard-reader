// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLocalProgress, writeLocalProgress } from "#/lib/reading-progress";

import { useReadingProgress } from "./use-reading-progress";

const setReadingProgress = vi.fn(async () => ({ ok: true as const }));
const clearReadingProgress = vi.fn(async () => ({ ok: true as const }));

vi.mock("#/integrations/tanstack-query/api-reader.functions", () => ({
  readerApi: {
    clearReadingProgress: (...args: Array<unknown>) =>
      clearReadingProgress(...(args as [])),
    getReadingProgressQueryOptions: (documentUri: string) => ({
      queryKey: ["reader", "readingProgress", documentUri] as const,
      // The other-device correction. Absent in these tests: what is under test
      // is what the *local* copy does on landing.
      queryFn: async () => null,
    }),
    setReadingProgress: (...args: Array<unknown>) =>
      setReadingProgress(...(args as [])),
  },
}));

const DOCUMENT_URI = "at://did:plc:reader/site.standard.document/abc";

/** Tall enough that a fraction maps to a distinctive offset. */
const ARTICLE_HEIGHT = 5000;

/** `progressGeometry`'s range for the article below: height − viewport. */
const RANGE = ARTICLE_HEIGHT - 768;

function offsetFor(progress: number): number {
  return Math.round(progress * RANGE);
}

/**
 * An `<article>` with real geometry. jsdom lays nothing out, so the two
 * measurements the hook takes are supplied by hand: the element starts at the
 * top of the document and is `ARTICLE_HEIGHT` tall.
 */
function articleElement(): HTMLElement {
  const element = document.createElement("article");
  Object.defineProperty(element, "offsetHeight", { value: ARTICLE_HEIGHT });
  element.getBoundingClientRect = () =>
    ({ top: -globalThis.scrollY }) as DOMRect;
  document.body.append(element);
  return element;
}

/** `scrollY` is read-only on a real window; jsdom lays out nothing anyway. */
function setScrollY(y: number) {
  Object.defineProperty(globalThis, "scrollY", {
    configurable: true,
    value: y,
    writable: true,
  });
}

/** What a browser does on `scrollTo`, minus the asynchronous scroll event. */
function stubScrollTo() {
  vi.stubGlobal("scrollTo", (_x: number, y: number) => setScrollY(y));
}

/** A scroll this hook did not ask for — the router's, or the reader's. */
function scrollTo(y: number) {
  act(() => {
    setScrollY(y);
    globalThis.dispatchEvent(new Event("scroll"));
  });
}

function setup({ enabled = true }: { enabled?: boolean } = {}) {
  const articleRef = { current: articleElement() };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(
    () =>
      useReadingProgress({
        articleRef,
        documentUri: DOCUMENT_URI,
        enabled,
        skipRestore: false,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  stubScrollTo();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  setScrollY(0);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  setReadingProgress.mockClear();
  clearReadingProgress.mockClear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setScrollY(0);
});

describe("useReadingProgress", () => {
  it("lands on the remembered position", () => {
    writeLocalProgress(DOCUMENT_URI, 0.5);

    const { result } = setup();

    expect(globalThis.scrollY).toBe(offsetFor(0.5));
    expect(result.current.resumed).toBe(true);
  });

  /**
   * The regression: the router's `scrollRestoration` runs on `onRendered`, from
   * a layout effect mounted after the route's own tree, so on every in-app
   * navigation it scrolls a freshly-restored article back to the top a beat
   * after the restore. Landing at the top was the visible half; the invisible
   * half was worse — the 0 that scroll measured was saved a second later, and a
   * write outside the 2–95% band *deletes*, so one clobbered restore took the
   * position off this device, off the server, and off the shelf. Which is why
   * it appeared to work exactly once.
   */
  it("corrects a scroll it did not ask for, and never saves one", () => {
    writeLocalProgress(DOCUMENT_URI, 0.5);

    setup();
    expect(globalThis.scrollY).toBe(offsetFor(0.5));

    scrollTo(0);

    expect(globalThis.scrollY).toBe(offsetFor(0.5));

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(setReadingProgress).not.toHaveBeenCalled();
    expect(readLocalProgress(DOCUMENT_URI)?.progress).toBe(0.5);
  });

  it("hands the page back the moment the reader touches it", async () => {
    writeLocalProgress(DOCUMENT_URI, 0.5);

    setup();

    act(() => {
      globalThis.dispatchEvent(new Event("wheel"));
    });

    // No longer ours to steer: the reader's scroll stands, and is recorded.
    scrollTo(offsetFor(0.25));
    expect(globalThis.scrollY).toBe(offsetFor(0.25));

    // Async: the local write is synchronous, but the server write goes through
    // React Query's mutation queue, which settles on a microtask.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(readLocalProgress(DOCUMENT_URI)?.progress).toBeCloseTo(0.25, 2);
    expect(setReadingProgress).toHaveBeenCalledTimes(1);
  });

  it("forgets the position when the reader scrolls back to the top", () => {
    writeLocalProgress(DOCUMENT_URI, 0.5);

    setup();

    act(() => {
      globalThis.dispatchEvent(new Event("wheel"));
    });
    scrollTo(0);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(readLocalProgress(DOCUMENT_URI)).toBeNull();
  });

  it("leaves the landing position alone when the URL names an anchor", () => {
    writeLocalProgress(DOCUMENT_URI, 0.5);
    globalThis.history.replaceState(null, "", "/a/did/rkey#footnote-3");

    const { result } = setup();

    expect(globalThis.scrollY).toBe(0);
    expect(result.current.resumed).toBe(false);

    globalThis.history.replaceState(null, "", "/");
  });
});
