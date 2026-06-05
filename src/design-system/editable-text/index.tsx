"use client";

import type { KeyboardEvent } from "react";

import { useControlledState } from "@react-stately/utils";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { mergeProps, useLongPress } from "react-aria";
import { TextField as AriaTextField, Input } from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";

const focusClosestFocusableElement = () => {
  const focusableElements = document.activeElement?.parentElement?.closest(
    "button, input, textarea, select, a, [tabindex]:not([tabindex='-1'])",
  );
  if (!focusableElements) return;
  (focusableElements as HTMLElement).focus();
};

const styles = stylex.create({
  input: {
    borderRadius: radius.xs,
    borderWidth: 0,
    textDecoration: "inherit",
    backgroundColor: "transparent",
    display: "inline-block",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    lineHeight: "inherit",
    textAlign: "inherit",
    textTransform: "inherit",
    minWidth: 0,

    outlineColor: "blue",
    outlineStyle: "solid",
    outlineWidth: {
      default: "0px",
      ":focus": "1px",
    },

    marginBottom: `calc(${verticalSpace["xxs"]} * -1)`,
    marginLeft: `calc(${horizontalSpace["sm"]} * -1)`,
    marginRight: `calc(${horizontalSpace["sm"]} * -1)`,
    marginTop: `calc(${verticalSpace["xxs"]} * -1)`,
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
    paddingTop: verticalSpace["xs"],
  },
});

export interface EditableTextProps extends StyleXComponentProps<
  Omit<React.ComponentProps<"span">, "children" | "onChange">
> {
  /**
   * The current value of the editable text.
   */
  children: string;
  /**
   * Callback fired when the value changes.
   */
  onChange?: (value: string) => void;

  /**
   * Whether the component is read-only.
   */
  isReadOnly?: boolean;
  /**
   * Whether to show the input field on mount.
   */
  defaultEditing?: boolean;
  /**
   * Whether the component is currently in editing mode (controlled).
   */
  isEditing?: boolean;
  /**
   * Callback fired when the editing state changes.
   */
  onEditingChange?: (isEditing: boolean) => void;
}

export function EditableText({
  children,
  onChange,
  isReadOnly,
  defaultEditing,
  isEditing: isEditingProp,
  onEditingChange,
  style,
  ...props
}: EditableTextProps) {
  const [isEditingState, setIsEditingState] = useControlledState(
    isEditingProp,
    defaultEditing ?? false,
    onEditingChange,
  );
  const [editValue, setEditValue] = useState(children);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing =
    isEditingProp === undefined ? isEditingState : isEditingProp;
  const setIsEditing = (newIsEditing: boolean) => {
    if (isEditingProp === undefined) {
      setIsEditingState(newIsEditing);
    }
    onEditingChange?.(newIsEditing);
  };

  const handleStartEditing = () => {
    if (isReadOnly) return;
    setEditValue(children);
    setIsEditing(true);
    // Focus the input after it's rendered
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleCommit = (newValue: string) => {
    focusClosestFocusableElement();
    setIsEditing(false);
    if (newValue !== children) {
      onChange?.(newValue);
    }
  };

  const handleCancel = () => {
    focusClosestFocusableElement();
    setIsEditing(false);
    setEditValue(children);
  };

  const handleKeyDown = useEffectEvent((e: Event) => {
    const event = e as unknown as KeyboardEvent;

    if (event.key === "Enter") {
      e.preventDefault();
      handleCommit(editValue);
    } else if (event.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }

    e.stopPropagation();
  });

  const handleBlur = () => {
    handleCommit(editValue);
  };

  const { longPressProps } = useLongPress({
    onLongPress: handleStartEditing,
  });

  useEffect(() => {
    if (!isEditing) return;

    globalThis.addEventListener("keydown", handleKeyDown, {
      capture: true,
    });
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
    };
  }, [isEditing]);

  if (isEditing) {
    return (
      <AriaTextField
        value={editValue}
        onChange={setEditValue}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        isReadOnly={isReadOnly}
        {...stylex.props(style)}
      >
        <Input
          {...stylex.props(styles.input)}
          ref={inputRef}
          onBlur={handleBlur}
        />
      </AriaTextField>
    );
  }

  return <span {...mergeProps(props, longPressProps)}>{children}</span>;
}
