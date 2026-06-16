"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

const PHOTO_SCOPE =
  ".feature-body, .editorial-body, .feature-note-body, .editorial-spread";

function isBskyMediaImage(img: HTMLImageElement): boolean {
  const cls = img.className;
  if (/avatar|logo|Icon|starterPack/i.test(cls)) return false;
  return /singleImage|ImagesImg|RemainingImages|externalThumbnail|videoEmbedThumbnail|genericImageImg/.test(
    cls,
  );
}

function isExcludedMagazineImage(img: HTMLImageElement): boolean {
  if (img.closest(".flow-col, .img-page, .cover-left, .endcard")) return true;
  if (
    img.classList.contains("img-bg") ||
    img.classList.contains("cover-hero")
  ) {
    return true;
  }
  return false;
}

function isMagazinePhotoImage(
  img: HTMLImageElement,
  root: HTMLElement,
): boolean {
  if (!root.contains(img)) return false;
  if (isExcludedMagazineImage(img)) return false;

  if (img.closest("[data-bsky-post-embed]")) {
    return isBskyMediaImage(img);
  }

  return Boolean(img.closest(PHOTO_SCOPE));
}

function photoImagesIn(
  scope: HTMLElement,
  root: HTMLElement,
): Array<HTMLImageElement> {
  return [...scope.querySelectorAll("img")].filter(
    (node): node is HTMLImageElement =>
      node instanceof HTMLImageElement && isMagazinePhotoImage(node, root),
  );
}

function galleryScopeFor(img: HTMLImageElement): HTMLElement {
  return (
    img.closest("[data-bsky-post-embed]") ??
    img.closest(".feature-body, .editorial-body, .feature-note-body") ??
    img
  );
}

function lightboxImageUrl(img: HTMLImageElement): string {
  const src = img.currentSrc || img.src;
  return src.replace("/feed_thumbnail/", "/feed_fullsize/");
}

export function useMagazineImageLightbox(
  rootRef: RefObject<HTMLElement | null>,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<Array<string>>([]);
  const [initialIndex, setInitialIndex] = useState(0);

  const openAt = useCallback((nextImages: Array<string>, index: number) => {
    if (nextImages.length === 0) return;
    setImages(nextImages);
    setInitialIndex(index);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];

    const bindPhotoImages = () => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;

      for (const img of photoImagesIn(root, root)) {
        img.dataset.magPhoto = "true";
        if (!img.closest("[data-bsky-post-embed]")) {
          img.dataset.magBlockPhoto = "true";
        }
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        if (!img.alt) img.setAttribute("aria-label", "View image");

        const onActivate = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const scope = galleryScopeFor(img);
          const imgs = photoImagesIn(scope, root);
          const urls = imgs
            .map(lightboxImageUrl)
            .filter((url) => url.length > 0);
          openAt(urls, Math.max(0, imgs.indexOf(img)));
        };

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          onActivate(event);
        };

        img.addEventListener("click", onActivate, true);
        img.addEventListener("keydown", onKeyDown, true);
        cleanups.push(() => {
          img.removeEventListener("click", onActivate, true);
          img.removeEventListener("keydown", onKeyDown, true);
        });
      }
    };

    bindPhotoImages();
    const observer = new MutationObserver(bindPhotoImages);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const cleanup of cleanups) cleanup();
    };
  }, [openAt, rootRef]);

  return { isOpen, setIsOpen, images, initialIndex };
}
