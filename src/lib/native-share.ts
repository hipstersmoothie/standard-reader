"use client";

import { useEffect, useState } from "react";

export function canNativeShare(): boolean {
  return (
    globalThis.navigator !== undefined &&
    typeof globalThis.navigator.share === "function"
  );
}

export function useNativeShareAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(canNativeShare());
  }, []);

  return available;
}

/** Opens the OS share sheet for a URL. Returns true if a share completed. */
export async function shareLinkUrl(
  url: string,
  options?: { title?: string; text?: string },
): Promise<boolean> {
  if (!canNativeShare()) return false;

  const shareData: ShareData = { url, ...options };
  if (
    globalThis.navigator.canShare !== undefined &&
    !globalThis.navigator.canShare(shareData)
  ) {
    return false;
  }

  try {
    await globalThis.navigator.share(shareData);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    throw error;
  }
}
