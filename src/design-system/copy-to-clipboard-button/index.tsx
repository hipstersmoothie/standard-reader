"use client";

import { Copy } from "lucide-react";
import { useRef, useState } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { IconButton } from "../icon-button";

const defaultIcon = <Copy />;

/**
 * Props for the CopyToClipboardButton component.
 */
export interface CopyToClipboardButtonProps extends StyleXComponentProps<{}> {
  /**
   * The text to copy to the clipboard when the button is clicked.
   */
  text: string;
  /**
   * Optional icon to display. Defaults to a Copy icon.
   */
  icon?: React.ReactNode;
  /**
   * The size of the button. Defaults to "sm".
   */
  size?: Size;
}

/**
 * A button component that copies text to the clipboard when clicked.
 * Displays a tooltip that changes to "Copied ✓" after copying.
 */
export const CopyToClipboardButton = ({
  style,
  text,
  icon = defaultIcon,
  size = "sm",
}: CopyToClipboardButtonProps) => {
  const [tooltipText, setTooltipText] = useState("Copy to clipboard");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const changeTextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleCopy = () => {
    if (changeTextTimeoutRef.current) {
      clearTimeout(changeTextTimeoutRef.current);
      changeTextTimeoutRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    void navigator.clipboard.writeText(text);
    setTooltipText("Copied ✓");
    setTooltipOpen(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;

      setTooltipOpen(false);

      changeTextTimeoutRef.current = setTimeout(() => {
        setTooltipText("Copy to clipboard");
        changeTextTimeoutRef.current = null;
      }, 200);
    }, 2000);
  };

  return (
    <IconButton
      label={tooltipText}
      tooltipOpen={tooltipOpen}
      onTooltipOpenChange={(isOpen) =>
        !timeoutRef.current && setTooltipOpen(isOpen)
      }
      variant="tertiary"
      style={style}
      size={size}
      onClick={handleCopy}
    >
      {icon}
    </IconButton>
  );
};
