import type { ButtonProps as AriaButtonProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use, useLayoutEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";
import { uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../theme/typography.stylex";

const styles = stylex.create({
  wrapper: {
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    backgroundColor: uiColor.component1,
    display: "flex",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,

    cornerShape: "squircle",
  },
  wrapperSm: {
    borderRadius: {
      default: radius.sm,
      [mediaQueries.supportsSquircle]: radius["3xl"],
    },
    height: sizeSpace["xl"],
    width: sizeSpace["xl"],
  },
  wrapperMd: {
    borderRadius: {
      default: radius.md,
      [mediaQueries.supportsSquircle]: radius["3xl"],
    },
    height: sizeSpace["3xl"],
    width: sizeSpace["3xl"],
  },
  wrapperLg: {
    borderRadius: {
      default: radius.lg,
      [mediaQueries.supportsSquircle]: radius["3xl"],
    },
    height: sizeSpace["4xl"],
    width: sizeSpace["4xl"],
  },
  wrapperXl: {
    borderRadius: {
      default: radius.xl,
      [mediaQueries.supportsSquircle]: radius["3xl"],
    },
    height: sizeSpace["5xl"],
    width: sizeSpace["5xl"],
  },
  image: {
    objectFit: "cover",
    objectPosition: "center",
    height: "100%",
    width: "100%",
  },
  fallback: {
    alignItems: "center",
    color: uiColor.text1,
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["medium"],
    justifyContent: "center",
    lineHeight: lineHeight["none"],
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  },
  fallbackSm: {
    fontSize: fontSize["sm"],
  },
  fallbackMd: {
    fontSize: fontSize["base"],
  },
  fallbackLg: {
    fontSize: fontSize["lg"],
  },
  fallbackXl: {
    fontSize: fontSize["xl"],
  },
  buttonWrapper: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    paddingRight: 0,
    backgroundColor: "transparent",
    paddingTop: 0,
    cursor: "pointer",
    display: "inline-block",
    outline: {
      default: "none",
      ":is([data-focused='true'][data-focus-visible='true'])": `revert`,
    },
  },
  overlay: {
    inset: 0,
    backgroundColor: uiColor.solid2,
    opacity: {
      default: 0,
      ":is([data-avatar-button='true'][data-hovered='true'] *)": 0.5,
    },
    pointerEvents: "none",
    position: "absolute",
    transitionDuration: animationDuration.default,
    // Only apply transition after mount to prevent initial render animation
    transitionProperty: {
      default: "none",
      ":is([data-overlay-mounted])": "opacity",
    },
    transitionTimingFunction: animationTimingFunction.easeOut,
  },
});

export interface AvatarProps extends StyleXComponentProps<
  Omit<React.ComponentProps<"div">, "children">
> {
  /** The source of the image. */
  src?: string;
  /** The alt text of the image. */
  alt?: string;
  /** The fallback content of the avatar. */
  fallback: React.ReactNode;
  /** The size of the avatar. */
  size?: Size | "xl";
}

function AvatarImageWithState({
  src,
  alt,
  onStateChange,
}: {
  src: string;
  alt: string;
  onStateChange: (loaded: boolean, error: boolean) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  // Check if image is already cached/loaded
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const handleLoad = () => {
      onStateChange(true, false);
    };

    const handleError = () => {
      onStateChange(false, true);
    };

    // If image is already loaded (cached), call handleLoad immediately
    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    } else {
      // Otherwise, wait for load event
      img.addEventListener("load", handleLoad);
      img.addEventListener("error", handleError);

      return () => {
        img.removeEventListener("load", handleLoad);
        img.removeEventListener("error", handleError);
      };
    }
  }, [src, onStateChange]);

  return (
    <img
      ref={imgRef}
      {...stylex.props(styles.image)}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}

function AvatarContent({
  src,
  alt,
  fallback,
  size,
}: {
  src?: string;
  alt: string;
  fallback: React.ReactNode;
  size: Size | "xl";
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [hasCheckedImage, setHasCheckedImage] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Enable transitions after initial render (CSS can't detect this)
    if (overlayRef.current) overlayRef.current.dataset.overlayMounted = "";
  }, []);

  const handleStateChange = (loaded: boolean, error: boolean) => {
    setImageLoaded(loaded);
    setImageError(error);
    setHasCheckedImage(true);
  };

  // Only show fallback if we've checked and the image isn't loaded or has error
  const showFallback =
    !src || (hasCheckedImage && (imageError || !imageLoaded));

  return (
    <>
      {src && !imageError && (
        <AvatarImageWithState
          key={src}
          src={src}
          alt={alt}
          onStateChange={handleStateChange}
        />
      )}
      {showFallback && (
        <div
          {...stylex.props(
            styles.fallback,
            size === "sm" && styles.fallbackSm,
            size === "md" && styles.fallbackMd,
            size === "lg" && styles.fallbackLg,
            size === "xl" && styles.fallbackXl,
          )}
        >
          {fallback}
        </div>
      )}
      <div ref={overlayRef} {...stylex.props(styles.overlay)} />
    </>
  );
}

export function Avatar({
  style,
  alt = "",
  src,
  fallback,
  size: sizeProp,
  ...props
}: AvatarProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <div
      {...props}
      {...stylex.props(
        styles.wrapper,
        size === "sm" && styles.wrapperSm,
        size === "md" && styles.wrapperMd,
        size === "lg" && styles.wrapperLg,
        size === "xl" && styles.wrapperXl,
        style,
      )}
    >
      <AvatarContent
        key={src}
        src={src}
        alt={alt}
        fallback={fallback}
        size={size}
      />
    </div>
  );
}

export interface AvatarButtonProps
  extends
    StyleXComponentProps<AriaButtonProps>,
    Pick<AvatarProps, "size" | "src" | "alt" | "fallback"> {
  /** The style for the avatar. */
  avatarStyle?: AvatarProps["style"];
}

export function AvatarButton({
  avatarStyle,
  style,
  size: sizeProp,
  src,
  alt,
  fallback,
  ...buttonProps
}: AvatarButtonProps) {
  const size = sizeProp || use(SizeContext);
  const avatarProps: AvatarProps = {
    src,
    alt,
    fallback,
    size,
  };

  return (
    <AriaButton
      data-avatar-button
      {...buttonProps}
      {...stylex.props(styles.buttonWrapper, style)}
    >
      <Avatar {...avatarProps} size={size} style={avatarStyle} />
    </AriaButton>
  );
}
