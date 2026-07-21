import { defaultComponents } from "./defaults";
import type { RendererComponents, RendererComponentsInput } from "./types";

/**
 * Merge a user's partial `components` prop over the unstyled defaults. The merge
 * is shallow within each category (`shared`, `leaflet`, `pckt`, `offprint`) —
 * every component is an atomic override, so a supplied `shared.Image` replaces
 * only the image renderer and leaves the rest as defaults.
 */
export function mergeComponents(
  input?: RendererComponentsInput,
): RendererComponents {
  if (!input) return defaultComponents;
  return {
    shared: { ...defaultComponents.shared, ...input.shared },
    leaflet: { ...defaultComponents.leaflet, ...input.leaflet },
    pckt: { ...defaultComponents.pckt, ...input.pckt },
    offprint: { ...defaultComponents.offprint, ...input.offprint },
  };
}
