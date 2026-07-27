"use client";

import { useHover } from "react-aria";

export function useMagHover(options?: { isDisabled?: boolean }) {
  const { hoverProps, isHovered } = useHover(options ?? {});
  return { hoverProps, isHovered };
}
