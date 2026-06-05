"use client";

import { createContext, useCallback } from "react";
import { useWebHaptics } from "web-haptics/react";

import type { HapticIntent } from "./haptics";

import {
  HAPTIC_PRESET_MAP,
  isHapticsEnabled,
  setHapticsEnabled,
} from "./haptics";

export interface HapticsContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  trigger: (intent: HapticIntent) => void;
}

/* eslint-disable react/only-export-components -- HapticsContext is consumed by useHaptics */
export const HapticsContext = createContext<HapticsContextValue | null>(null);
/* eslint-enable react/only-export-components */

/**
 * Provider for haptics enable/disable state.
 * Uses useWebHaptics under the hood; children use useHaptics() to trigger feedback.
 */
export function HapticsProvider({ children }: { children: React.ReactNode }) {
  const { trigger: webTrigger } = useWebHaptics();

  const trigger = useCallback(
    (intent: HapticIntent) => {
      if (!isHapticsEnabled()) return;
      const preset = HAPTIC_PRESET_MAP[intent];
      webTrigger(preset);
    },
    [webTrigger],
  );

  const value: HapticsContextValue = {
    enabled: isHapticsEnabled(),
    setEnabled: useCallback((enabled: boolean) => {
      setHapticsEnabled(enabled);
    }, []),
    trigger,
  };

  return (
    <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>
  );
}
