"use client";

import type { ComponentProps } from "react";
import { mergeProps } from "react-aria";

import { useMagHover } from "./use-mag-hover";

export function MagHoverButton({
  className,
  disabled,
  ...props
}: ComponentProps<"button">) {
  const { hoverProps, isHovered } = useMagHover({ isDisabled: disabled });
  return (
    <button
      {...mergeProps(props, hoverProps)}
      disabled={disabled}
      data-hovered={isHovered || undefined}
      className={className}
    />
  );
}
