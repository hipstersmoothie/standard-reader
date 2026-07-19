import { useEffect, useState } from "react";

/**
 * `false` during SSR and on the first client render, `true` afterwards.
 *
 * For content whose data arrives from a non-blocking loader prefetch: the
 * server may finish that fetch mid-render and emit the loaded markup, while the
 * client hydrates before the same data lands, and React reports a mismatch.
 * Gating on this makes both sides render the pending branch, so hydration is
 * deterministic and the content streams in a beat later.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
