/**
 * YouTube (and some other players) reject or degrade embeds that arrive without
 * a cross-origin Referer. Spotify is one of them: with `no-referrer` its player
 * falls back to a short compact card that doesn't fill the height its own oEmbed
 * asks for (e.g. 352px for a playlist), leaving empty space below it. Sending
 * the origin lets it render the full player that fills the frame.
 */
export function iframeReferrerPolicy(
  url: string,
): React.HTMLAttributeReferrerPolicy {
  const normalized = url.toLowerCase();
  const needsReferrer =
    normalized.includes("youtube.com") ||
    normalized.includes("youtube-nocookie.com") ||
    normalized.includes("youtu.be") ||
    normalized.includes("player.vimeo.com") ||
    normalized.includes("vimeo.com") ||
    normalized.includes("fast.wistia.com") ||
    normalized.includes("wistia.com") ||
    normalized.includes("wistia.net") ||
    normalized.includes("spotify.com");

  return needsReferrer ? "strict-origin-when-cross-origin" : "no-referrer";
}

export function parseDimension(
  value: string | number | undefined,
): number | undefined {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}
