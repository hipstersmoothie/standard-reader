import { defaultComponents } from "./defaults";
import type { SolidComponents, SolidComponentsInput } from "./types";

/**
 * Merge a partial `components` input over the unstyled defaults. The merge is
 * shallow within each category (`shared`, `leaflet`, `pckt`, `offprint`) —
 * every component is an atomic override.
 */
export function mergeComponents(input?: SolidComponentsInput): SolidComponents {
  if (!input) return defaultComponents;
  return {
    shared: { ...defaultComponents.shared, ...input.shared },
    leaflet: { ...defaultComponents.leaflet, ...input.leaflet },
    pckt: { ...defaultComponents.pckt, ...input.pckt },
    offprint: { ...defaultComponents.offprint, ...input.offprint },
  };
}
