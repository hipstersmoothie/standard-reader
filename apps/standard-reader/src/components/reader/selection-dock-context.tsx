"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * Lets the text-selection toolbar take over the mobile bottom-nav slot.
 *
 * On touch devices the OS selection callout renders directly above the
 * selection, covering a toolbar anchored there. Instead, the selection toolbar
 * portals itself into the dock — where the bottom nav normally sits — and the
 * nav steps aside while a selection is active.
 */
interface SelectionDockValue {
  /** Container the selection toolbar renders into, once the dock has mounted it. */
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  /** True while a selection toolbar wants the dock slot. */
  isActive: boolean;
  setActive: (active: boolean) => void;
}

const SelectionDockContext = createContext<SelectionDockValue | null>(null);

export function SelectionDockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [isActive, setActive] = useState(false);

  const value = useMemo(
    () => ({ slot, setSlot, isActive, setActive }),
    [isActive, slot],
  );

  return (
    <SelectionDockContext.Provider value={value}>
      {children}
    </SelectionDockContext.Provider>
  );
}

/** Returns null outside the reader shell (e.g. embeds render standalone). */
// eslint-disable-next-line react/only-export-components -- consumed by the selection toolbar
export function useSelectionDock(): SelectionDockValue | null {
  return useContext(SelectionDockContext);
}
