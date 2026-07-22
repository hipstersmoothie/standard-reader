import type { KeyboardEvent } from "react";

/**
 * Props that turn a static element into a keyboard-accessible button — a role,
 * a tab stop, and Enter/Space activation. The design leans on clickable rows
 * and inline "back" affordances; this keeps them operable without a keyboard
 * user being stranded.
 */
export function clickable(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
