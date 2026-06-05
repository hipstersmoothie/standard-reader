"use client";

import * as stylex from "@stylexjs/stylex";
import { Star } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { mergeProps, useKeyboard, usePress } from "react-aria";

import type { FlexProps } from "../flex";
import type { StyleXComponentProps } from "../theme/types";

import { Flex } from "../flex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { gap } from "../theme/semantic-spacing.stylex";
import { Text } from "../typography/text";

const MAX_STARS = 5;

const styles = stylex.create({
  stars: {
    gap: gap["xxs"],
    alignItems: "center",
    display: "flex",
  },
  starsInput: {
    cursor: "pointer",
  },
  starsInputDisabled: {
    cursor: "not-allowed",
  },
  starFilled: {
    color: primaryColor.solid2,
  },
  starEmpty: {
    color: uiColor.component3,
  },
  starButton: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderColor: "transparent",
    paddingRight: 0,
    borderStyle: "none",
    paddingTop: 0,
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    cursor: "pointer",
    display: "flex",
  },
  starButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.5,
  },
  halfStarWrapper: {
    display: "inline-flex",
    position: "relative",
    height: "var(--star-size, 1rem)",
    width: "var(--star-size, 1rem)",
  },
  halfStarBase: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  halfStarClip: {
    overflow: "hidden",
    clipPath: "inset(0 50% 0 0)",
    position: "absolute",
    left: 0,
    top: 0,
  },
});

export interface StarRatingProps extends StyleXComponentProps<
  React.HTMLAttributes<HTMLDivElement>
> {
  /** Rating from 0 to 5 (supports 0.5 steps). Null shows empty stars. */
  rating: number | null;
  /** Optional review count to display */
  reviewCount?: number;
  /** Size of the star icons in pixels */
  size?: number;
  /** Whether to show the review count */
  showReviewCount?: boolean;
}

/**
 * Displays a read-only star rating with half-star support.
 */
export function StarRating({
  rating,
  reviewCount,
  size = 16,
  showReviewCount = true,
  style,
  ...props
}: StarRatingProps) {
  const clamped = Math.min(5, Math.max(0, rating == null ? 0 : rating));
  const fullStars = Math.floor(clamped);
  const remainder = clamped - fullStars;
  const showHalf = remainder >= 0.25 && remainder < 0.75;
  const showFullLast = remainder >= 0.75;
  const filledCount = fullStars + (showFullLast ? 1 : 0);
  const emptyCount = 5 - filledCount - (showHalf ? 1 : 0);

  return (
    <Flex direction="row" align="center" gap="xs" style={style} {...props}>
      <div
        {...stylex.props(styles.stars)}
        style={{ "--star-size": `${String(size)}px` } as React.CSSProperties}
      >
        {Array.from({ length: filledCount }, (_, i) => (
          <Star
            key={`full-${String(i)}`}
            size={size}
            fill="currentColor"
            {...stylex.props(styles.starFilled)}
          />
        ))}
        {showHalf && (
          <span {...stylex.props(styles.halfStarWrapper)}>
            <Star
              size={size}
              {...stylex.props(styles.starEmpty, styles.halfStarBase)}
            />
            <Star
              size={size}
              fill="currentColor"
              {...stylex.props(styles.starFilled, styles.halfStarClip)}
            />
          </span>
        )}
        {Array.from({ length: emptyCount }, (_, i) => (
          <Star
            key={`empty-${String(i)}`}
            size={size}
            {...stylex.props(styles.starEmpty)}
          />
        ))}
      </div>
      {showReviewCount && typeof reviewCount === "number" && (
        <Text size="xs" variant="secondary">
          ({reviewCount})
        </Text>
      )}
    </Flex>
  );
}

export interface StarRatingInputProps extends StyleXComponentProps<
  Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "style">
> {
  /** Current value (1–5). Use with onChange for controlled mode. */
  value?: number;
  /** Default value when uncontrolled. */
  defaultValue?: number;
  /** Called when the user selects a new rating. */
  onChange?: (value: number) => void;
  /** Whether the input is disabled. */
  isDisabled?: boolean;
  /** Size of the star icons in pixels */
  size?: number;
  /** Accessible label for the rating input. */
  "aria-label"?: string;
}

/**
 * Interactive star rating input for user selection.
 * Supports keyboard (arrow keys) and pointer interaction.
 */
export function StarRatingInput({
  value: valueProp,
  defaultValue = 0,
  onChange,
  isDisabled = false,
  size = 16,
  "aria-label": ariaLabel = "Rating",
  ...props
}: StarRatingInputProps) {
  const [valueState, setValueState] = useState(defaultValue);
  const value = valueProp === undefined ? valueState : valueProp;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const starsRef = useRef<HTMLDivElement>(null);

  const displayValue = hoveredIndex === null ? value : hoveredIndex + 1;
  const clampedValue = Math.min(MAX_STARS, Math.max(0, displayValue));

  const handleStarsMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDisabled) return;
      const el = starsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const index = Math.min(
        MAX_STARS - 1,
        Math.max(0, Math.floor((x / rect.width) * MAX_STARS)),
      );
      setHoveredIndex(index);
    },
    [isDisabled],
  );

  const handleStarsMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const setValue = useCallback(
    (newValue: number) => {
      const clamped = Math.min(MAX_STARS, Math.max(0, newValue));
      if (valueProp === undefined) {
        setValueState(clamped);
      }
      onChange?.(clamped);
    },
    [onChange, valueProp],
  );

  const { keyboardProps } = useKeyboard({
    onKeyDown: (e) => {
      if (isDisabled) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setValue(value + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setValue(value - 1);
      }
    },
  });

  return (
    <Flex
      direction="row"
      align="center"
      gap="xs"
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={MAX_STARS}
      aria-valuenow={value}
      aria-disabled={isDisabled}
      tabIndex={isDisabled ? undefined : 0}
      {...mergeProps(keyboardProps, props as FlexProps)}
    >
      <div
        ref={starsRef}
        {...stylex.props(
          styles.stars,
          styles.starsInput,
          isDisabled && styles.starsInputDisabled,
        )}
        style={{ "--star-size": `${String(size)}px` } as React.CSSProperties}
        onMouseMove={handleStarsMouseMove}
        onMouseLeave={handleStarsMouseLeave}
      >
        {Array.from({ length: MAX_STARS }, (_, i) => (
          <StarRatingInputButton
            key={i}
            size={size}
            isFilled={i < clampedValue}
            isDisabled={isDisabled}
            onPress={() => setValue(i + 1)}
          />
        ))}
      </div>
    </Flex>
  );
}

interface StarRatingInputButtonProps {
  size: number;
  isFilled: boolean;
  isDisabled: boolean;
  onPress: () => void;
}

function StarRatingInputButton({
  size,
  isFilled,
  isDisabled,
  onPress,
}: StarRatingInputButtonProps) {
  const { pressProps } = usePress({
    isDisabled,
    onPress,
  });

  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={isDisabled}
      {...pressProps}
      {...stylex.props(
        styles.starButton,
        isDisabled && styles.starButtonDisabled,
      )}
    >
      <Star
        size={size}
        fill={isFilled ? "currentColor" : undefined}
        {...stylex.props(isFilled ? styles.starFilled : styles.starEmpty)}
      />
    </button>
  );
}
