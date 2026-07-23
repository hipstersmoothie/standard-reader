import type * as stylex from "@stylexjs/stylex";

export type ThemeKeys<T> =
  T extends stylex.VarGroup<Readonly<infer Tokens>> ? keyof Tokens : never;

export type Size = "sm" | "md" | "lg";
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "critical"
  | "critical-outline";
export type LabelVariant = "vertical" | "horizontal";
export type InputVariant = "primary" | "secondary" | "tertiary";
export type InputValidationState = "valid" | "invalid" | "warning";
export type ButtonGroupVariant = "grouped" | "separate";
export type TextVariant = "primary" | "secondary" | "critical";
export type MeterVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "critical";
export type ToastVariant = "neuthral" | "success" | "warning" | "critical";

export type StyleXComponentProps<T extends object> = Omit<
  T,
  "className" | "style"
> & {
  className?: never;
  /**
   * The style to apply to the component.
   */
  style?: stylex.StyleXStyles;
};
