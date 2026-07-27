import type { CollectionEditorial } from "#/lib/collections/manifest";

/** Strip common markdown syntax for social preview copy. */
export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replaceAll(/```[\s\S]*?```/g, " ")
    .replaceAll(/`[^`]+`/g, " ")
    .replaceAll(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replaceAll(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replaceAll(/^#+\s+/gm, "")
    .replaceAll(/[*_~>#-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function collectionFeatureLabel(count: number): string {
  return `${count} ${count === 1 ? "feature" : "features"}`;
}

/** Meta description for a collection share link. */
export function collectionOgDescription(input: {
  editorial: CollectionEditorial | null | undefined;
  description: string | null | undefined;
  featureCount: number;
  publicationName: string | null | undefined;
}): string {
  const editorialBody = input.editorial?.body?.trim();
  if (editorialBody) {
    return plainTextFromMarkdown(editorialBody);
  }

  const docDescription = input.description?.trim();
  if (docDescription) return docDescription;

  const count = collectionFeatureLabel(input.featureCount);
  const publication = input.publicationName?.trim();
  if (publication) {
    return `${count} curated from ${publication}.`;
  }

  return `${count} curated for Standard Reader.`;
}

export function collectionOgImageUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  const params = new URLSearchParams({ did, rkey });
  return `${baseUrl.replace(/\/$/, "")}/api/og/collection?${params.toString()}`;
}
