"use client";

import { useEffect, useState } from "react";

export function useDocsScrollSpy(ids: ReadonlyArray<string>): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const idsKey = ids.join("\0");

  useEffect(() => {
    if (globalThis.window === undefined || ids.length === 0) return;

    const observed = ids
      .map((id) => document.querySelector(`#${CSS.escape(id)}`))
      .filter((el): el is HTMLElement => el != null);

    if (observed.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible.length === 0) return;
        const next = visible[0]?.target.id ?? null;
        setActive((current) => (current === next ? current : next));
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: 0 },
    );

    for (const element of observed) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [ids, idsKey]);

  return active;
}
