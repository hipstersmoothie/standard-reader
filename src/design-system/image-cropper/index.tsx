"use client";

import type { ComponentProps } from "react";

import { Cropper as OriginCropper } from "@origin-space/image-cropper";
import { useEffectEvent } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import type { StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";

const styles = stylex.create({
  root: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${uiColor.solid1}`,
    },
    overflow: "hidden",
    alignItems: "center",
    cursor: "move",
    display: "flex",
    justifyContent: "center",
    outlineOffset: {
      default: "0px",
      ":focus-visible": "2px",
    },
    position: "relative",
    touchAction: "none",
  },
  image: {
    objectFit: "cover",
    pointerEvents: "none",
    userSelect: "none",
    height: "100%",
    width: "100%",
  },
  cropArea: {
    borderColor: uiColor.bg,
    borderStyle: "dashed",
    borderWidth: 2,
    boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
    pointerEvents: "none",
    position: "absolute",
  },
  description: {
    marginBottom: -1,
    marginLeft: -1,
    marginRight: -1,
    marginTop: -1,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    paddingRight: 0,
    overflow: "hidden",
    paddingTop: 0,
    clip: "rect(0, 0, 0, 0)",
    position: "absolute",
    whiteSpace: "nowrap",
    height: 1,
    width: 1,
  },
});

/**
 * Area object representing the cropped region in pixels relative to the original image.
 */
export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Props for the ImageCropper root component.
 */
export interface ImageCropperRootProps extends StyleXComponentProps<
  Omit<
    ComponentProps<typeof OriginCropper.Root>,
    | "className"
    | "style"
    | "children"
    | "onCropChange"
    | "image"
    | "aspectRatio"
  >
> {
  /**
   * URL of the image to crop.
   */
  image: string | Blob;
  /**
   * The desired width/height aspect ratio (e.g., 1, 1.5, 4/3, 16/9).
   * Set to `null` or `undefined` for free-form cropping (no aspect ratio constraint).
   * @default 1
   */
  aspectRatio?: number | null;
  /**
   * Minimum padding (in pixels) between the crop area edges and the container edges.
   * @default 25
   */
  cropPadding?: number;
  /**
   * Minimum zoom level (1 = 100% original size relative to crop area).
   * @default 1
   */
  minZoom?: number;
  /**
   * Maximum zoom level.
   * @default 3
   */
  maxZoom?: number;
  /**
   * Multiplier for mouse wheel delta to control zoom speed.
   * @default 0.005
   */
  zoomSensitivity?: number;
  /**
   * Number of pixels to pan the image when using arrow keys.
   * @default 10
   */
  keyboardStep?: number;
  /**
   * Controlled zoom level. If provided, component zoom state is controlled externally.
   */
  zoom?: number;
  /**
   * Callback function triggered whenever the crop area changes.
   * Receives pixel data or null if invalid.
   */
  onCropChange?: (pixels: Blob | null) => void;
  /**
   * Callback function triggered when the zoom level changes interactively.
   * Essential for controlled zoom prop.
   */
  onZoomChange?: (zoom: number) => void;
  /**
   * Child components. Should include ImageCropper.Image, ImageCropper.CropArea, and ImageCropper.Description.
   */
  children: React.ReactNode;
}

/**
 * Root component for the image cropper. Handles logic, state, and interactions.
 *
 * @example
 * ```tsx
 * <ImageCropper.Root
 *   image="https://example.com/image.jpg"
 *   aspectRatio={1}
 *   onCropChange={(area) => console.log(area)}
 * >
 *   <ImageCropper.Description />
 *   <ImageCropper.Image />
 *   <ImageCropper.CropArea />
 * </ImageCropper.Root>
 * ```
 */
export function ImageCropperRoot({
  style,
  image,
  aspectRatio,
  cropPadding = 25,
  minZoom = 1,
  maxZoom = 3,
  zoomSensitivity = 0.005,
  keyboardStep = 10,
  zoom,
  onCropChange,
  onZoomChange,
  children,
  ...props
}: ImageCropperRootProps) {
  const [imageUrl, setImageUrl] = useState<string>(() => "");

  const handleError = () => {
    onCropChange?.(null);
  };

  const createImageUrl = useEffectEvent(() => {
    // Create new URL for new image
    const newUrl =
      typeof image === "string" ? image : URL.createObjectURL(image);

    setImageUrl(newUrl);

    return () => {
      if (newUrl.startsWith("blob:")) {
        URL.revokeObjectURL(newUrl);
      }
    };
  });

  // Update URL when image changes and clean up previous one
  useEffect(() => {
    return createImageUrl();
  }, [image]);

  // Prepare props for OriginCropper - only include aspectRatio if it's not null/undefined
  const cropperProps = {
    ...props,
    image: imageUrl,
    cropPadding,
    minZoom,
    maxZoom,
    zoomSensitivity,
    keyboardStep,
    zoom,
  };

  // Only add aspectRatio if it's a number (not null/undefined)
  if (aspectRatio !== null && aspectRatio !== undefined) {
    (
      cropperProps as typeof cropperProps & { aspectRatio: number }
    ).aspectRatio = aspectRatio;
  }

  const stylexProps = stylex.props(styles.root, style);
  // Extract className and any other props, but exclude style if present to avoid CSSStyleDeclaration conflicts
  const {
    className,
    style: _,
    ...restStylexProps
  } = stylexProps as {
    className?: string;
    style?: unknown;
    [key: string]: unknown;
  };

  return (
    <OriginCropper.Root
      {...cropperProps}
      className={className}
      {...restStylexProps}
      onCropChange={(crop) => {
        if (!crop) {
          onCropChange?.(null);
          return;
        }

        // Load the image and crop it in a canvas
        const img = new Image();
        img.crossOrigin = "anonymous";

        const handleLoad = () => {
          if (globalThis.window === undefined) return;
          const canvas = document.createElement("canvas");
          canvas.width = crop.width;
          canvas.height = crop.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            onCropChange?.(null);
            return;
          }

          // Draw the cropped portion of the image
          ctx.drawImage(
            img,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height,
          );

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              onCropChange?.(blob);
            },
            "image/png",
            1,
          );
        };

        img.addEventListener("load", handleLoad);
        img.addEventListener("error", handleError);
        img.src = imageUrl;
      }}
      onZoomChange={onZoomChange}
    >
      {children}
    </OriginCropper.Root>
  );
}

/**
 * Props for the ImageCropper image component.
 */
export interface ImageCropperImageProps extends StyleXComponentProps<
  Omit<ComponentProps<typeof OriginCropper.Image>, "className" | "style">
> {}

/**
 * Renders the actual image element. It's positioned and scaled by ImageCropper.Root.
 *
 * @example
 * ```tsx
 * <ImageCropper.Image />
 * ```
 */
export function ImageCropperImage({ style, ...props }: ImageCropperImageProps) {
  return (
    <OriginCropper.Image {...props} {...stylex.props(styles.image, style)} />
  );
}

/**
 * Props for the ImageCropper crop area component.
 */
export interface ImageCropperCropAreaProps extends StyleXComponentProps<
  Omit<ComponentProps<typeof OriginCropper.CropArea>, "className" | "style">
> {}

/**
 * A visual indicator representing the crop area bounds. Style this component to show the crop overlay.
 *
 * @example
 * ```tsx
 * <ImageCropper.CropArea />
 * ```
 */
export function ImageCropperCropArea({
  style,
  ...props
}: ImageCropperCropAreaProps) {
  return (
    <OriginCropper.CropArea
      {...props}
      {...stylex.props(styles.cropArea, style)}
    />
  );
}

/**
 * Props for the ImageCropper description component.
 */
export interface ImageCropperDescriptionProps extends StyleXComponentProps<
  Omit<ComponentProps<typeof OriginCropper.Description>, "className" | "style">
> {
  /**
   * Accessibility instructions for screen reader users.
   * This component is required for accessibility.
   */
  children?: React.ReactNode;
}

/**
 * Renders accessibility instructions for screen reader users.
 * Its id is automatically linked via aria-describedby on the Root element.
 * This component is required for accessibility.
 *
 * @example
 * ```tsx
 * <ImageCropper.Description>
 *   Use mouse wheel or pinch to zoom, drag to pan, and arrow keys to move the image.
 * </ImageCropper.Description>
 * ```
 */
export function ImageCropperDescription({
  style,
  children = "Use mouse wheel or pinch to zoom, drag to pan, and arrow keys to move the image.",
  ...props
}: ImageCropperDescriptionProps) {
  return (
    <OriginCropper.Description
      {...props}
      {...stylex.props(styles.description, style)}
    >
      {children}
    </OriginCropper.Description>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const ImageCropper = {
  Root: ImageCropperRoot,
  Image: ImageCropperImage,
  CropArea: ImageCropperCropArea,
  Description: ImageCropperDescription,
};
