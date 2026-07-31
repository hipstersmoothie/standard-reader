/**
 * Thin wrapper over the CSS Custom Highlight API.
 *
 * Two features paint a single range under a registered name — the page reader's
 * current-sentence highlight and the selection toolbar's retained selection — so
 * the registry plumbing (feature detection, lazy registration, swapping the
 * painted range) lives here once rather than being copied per highlight.
 *
 * Each highlight needs a matching `::highlight(<name>)` rule in `styles.css` to
 * be visible; the rules there read themed custom properties so callers can
 * colour their highlight from design tokens.
 */

interface HighlightLike {
  add(range: Range): void;
  clear(): void;
}

interface HighlightRegistryLike {
  set(name: string, highlight: HighlightLike): void;
  delete(name: string): void;
}

export interface SingleRangeHighlight {
  /** Paint `range`, replacing whatever was painted before. */
  paint(range: Range): boolean;
  clear(): void;
}

function highlightRegistry(): HighlightRegistryLike | undefined {
  return (globalThis.CSS as unknown as { highlights?: HighlightRegistryLike })
    ?.highlights;
}

/**
 * A named highlight painting at most one range at a time. `paint` returns false
 * when the browser lacks the API, so callers can treat it as best-effort.
 */
export function createSingleRangeHighlight(name: string): SingleRangeHighlight {
  let active: HighlightLike | null = null;

  return {
    paint(range) {
      const registry = highlightRegistry();
      const Ctor = (
        globalThis as unknown as {
          Highlight?: new (...ranges: Array<Range>) => HighlightLike;
        }
      ).Highlight;
      if (!registry || !Ctor) return false;

      if (!active) {
        active = new Ctor();
        registry.set(name, active);
      }
      active.clear();
      active.add(range);
      return true;
    },
    clear() {
      highlightRegistry()?.delete(name);
      active = null;
    },
  };
}
