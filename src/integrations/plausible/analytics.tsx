"use client";

import { init } from "@plausible-analytics/tracker";
import { useEffect } from "react";

import { getPlausibleConfig } from "./config";

let initialized = false;

/** Initializes Plausible once on the client when `VITE_PLAUSIBLE_DOMAIN` is set. */
export function PlausibleAnalytics() {
  useEffect(() => {
    if (initialized) return;

    const config = getPlausibleConfig();
    if (!config) return;

    init(config);
    initialized = true;
  }, []);

  return null;
}
