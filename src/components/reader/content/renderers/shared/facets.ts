export interface FacetFeature {
  $type?: string;
  uri?: string;
  did?: string;
  handle?: string;
  atURI?: string;
}

/** Extract the `#feature` suffix from any AT Proto facet `$type`. */
export function facetFeatureKind($type: string | undefined): string | null {
  if (!$type) return null;
  const hash = $type.indexOf("#");
  if (hash === -1) return null;
  return $type.slice(hash + 1);
}

export function hasFacetKind(
  features: Array<FacetFeature>,
  kind: string,
): boolean {
  return features.some((feature) => facetFeatureKind(feature.$type) === kind);
}

export function findFacetFeature(
  features: Array<FacetFeature>,
  kind: string,
): FacetFeature | undefined {
  return features.find((feature) => facetFeatureKind(feature.$type) === kind);
}
