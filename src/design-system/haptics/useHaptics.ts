"use client";

import { useCallback, useContext } from "react";
import { useWebHaptics } from "web-haptics/react";

import type { HapticIntent } from "./haptics";

import { HapticsContext } from "./context";
import {
  HAPTIC_PRESET_MAP,
  isHapticsEnabled,
  setHapticsEnabled,
} from "./haptics";

interface HapticsContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  trigger: (intent: HapticIntent) => void;
}

/**
 * Access haptics API via useWebHaptics. Returns context value when inside HapticsProvider.
 */
export function useHaptics(): HapticsContextValue {
  const context = useContext(HapticsContext);
  const { trigger: webTrigger } = useWebHaptics();

  const fallbackTrigger = useCallback(
    (intent: HapticIntent) => {
      if (!isHapticsEnabled()) return;
      const preset = HAPTIC_PRESET_MAP[intent];
      webTrigger(preset);
    },
    [webTrigger],
  );

  if (context) return context;

  return {
    enabled: isHapticsEnabled(),
    setEnabled: setHapticsEnabled,
    trigger: fallbackTrigger,
  };
}
