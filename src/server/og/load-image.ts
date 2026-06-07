const FETCH_TIMEOUT_MS = 5000;

function toDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

/** Fetch a remote image for Satori `<img src={…} />`. */
export async function loadOgImage(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await response.arrayBuffer();
    return toDataUrl(buffer, contentType.split(";")[0] ?? "image/png");
  } catch {
    return null;
  }
}

/** Try publication icon, then owner avatar (matches `PublicationAvatar`). */
export async function loadPublicationIcon(
  iconUrl: string | null | undefined,
  ownerAvatarUrl: string | null | undefined,
): Promise<string | null> {
  const icon = await loadOgImage(iconUrl);
  if (icon) return icon;
  return loadOgImage(ownerAvatarUrl);
}
