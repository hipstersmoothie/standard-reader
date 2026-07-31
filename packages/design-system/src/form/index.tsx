"use client";

import * as stylex from "@stylexjs/stylex";
import type { FormProps as AriaFormProps } from "react-aria-components";
import { Form as AriaForm } from "react-aria-components";

import { gap } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  form: {
    gap: gap["2xl"],
    display: "flex",
    flexDirection: "column",
  },
});

export interface FormProps extends StyleXComponentProps<AriaFormProps> {}

export function Form({ style, ...props }: FormProps) {
  return <AriaForm {...props} {...stylex.props(styles.form, style)} />;
}
