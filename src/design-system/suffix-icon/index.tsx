import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, Check, CircleX } from "lucide-react";
import { use } from "react";
import { FieldErrorContext } from "react-aria-components";

import type { InputValidationState } from "../theme/types";

export interface SuffixIconProps {
  suffix: React.ReactNode | undefined;
  style?: stylex.StyleXStyles;
  validationIconStyle: stylex.StyleXStyles;
  validationState: InputValidationState | undefined;
}

export function SuffixIcon({
  suffix,
  validationState,
  style,
  validationIconStyle,
}: SuffixIconProps) {
  const state = use(FieldErrorContext);
  const isVisible = state?.isInvalid || validationState || suffix != null;

  if (!isVisible) {
    return null;
  }

  return (
    <div {...stylex.props(style)}>
      {suffix}
      {state?.isInvalid || validationState ? (
        <div {...stylex.props(validationIconStyle)}>
          {state?.isInvalid || validationState === "invalid" ? (
            <CircleX />
          ) : validationState === "valid" ? (
            <Check />
          ) : (
            <AlertTriangle />
          )}
        </div>
      ) : null}
    </div>
  );
}
