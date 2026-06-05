"use client";

import type {
  FileTriggerProps as AriaFileTriggerProps,
  ButtonProps,
  DropItem,
  DropZoneProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  FileTrigger as AriaFileTrigger,
  Button,
  DropZone,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { blue } from "../theme/colors/blue.stylex";

async function getFiles(items: Array<DropItem>): Promise<Array<File>> {
  return Promise.all(
    items.filter((item) => item.kind === "file").map((item) => item.getFile()),
  );
}

function hasAcceptedDropType(
  acceptedFileTypes: readonly string[],
  dropTypes: { has: (type: string | symbol) => boolean },
): boolean {
  const hasWildcard = acceptedFileTypes.some((type) => type.endsWith("/*"));
  if (hasWildcard) {
    // Some drag sources do not expose full MIME types during dragover.
    // Allow the drop interaction and validate actual files in `onDrop`.
    return true;
  }
  for (const acceptedType of acceptedFileTypes) {
    if (dropTypes.has(acceptedType)) {
      return true;
    }
  }
  return false;
}

function fileMatchesAcceptedType(file: File, acceptedType: string): boolean {
  const normalizedAcceptedType = acceptedType.toLowerCase();
  const normalizedMimeType = file.type.toLowerCase();
  if (acceptedType.endsWith("/*")) {
    const prefix = normalizedAcceptedType.slice(0, -1);
    if (normalizedMimeType.startsWith(prefix)) {
      return true;
    }
    // Fallback for drag sources that omit MIME type.
    if (normalizedMimeType === "" && prefix === "image/") {
      const imageExtensions = [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".avif",
        ".svg",
      ];
      const lowerName = file.name.toLowerCase();
      return imageExtensions.some((ext) => lowerName.endsWith(ext));
    }
    return false;
  }
  if (normalizedMimeType === normalizedAcceptedType) {
    return true;
  }
  if (normalizedMimeType === "") {
    if (normalizedAcceptedType === "image/png") {
      return file.name.toLowerCase().endsWith(".png");
    }
    if (normalizedAcceptedType === "image/jpeg") {
      const lowerName = file.name.toLowerCase();
      return lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
    }
  }
  return false;
}

const styles = stylex.create({
  dropZone: {
    paddingBottom: verticalSpace["2xl"],
    paddingLeft: horizontalSpace["2xl"],
    borderColor: {
      default: uiColor.border3,
      ":is([data-drop-target])": primaryColor.solid1,
      ":is([data-focus-visible])": blue.border3,
    },
    paddingRight: horizontalSpace["2xl"],
    borderRadius: radius.lg,
    paddingTop: verticalSpace["2xl"],
    borderStyle: {
      default: "dashed",
      ":is([data-drop-target])": "solid",
    },
    borderWidth: 2,

    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: {
      default: uiColor.bgSubtle,
      ":is([data-drop-target])": primaryColor.component1,
    },
    boxSizing: "border-box",
    position: "relative",
    transitionDuration: {
      default: animationDuration.fast,
      [mediaQueries.reducedMotion]: "0s",
    },
    transitionProperty: {
      default: "background-color, border-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: animationTimingFunction.easeInOut,

    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  defaultTrigger: {
    inset: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    opacity: {
      default: 0,
      ":is([data-hovered])": 0.5,
    },
    position: "absolute",
    transitionDuration: animationDuration.default,
    transitionProperty: "opacity",
    transitionTimingFunction: animationTimingFunction.easeInOut,
  },
});

interface FileDropZoneProps
  extends
    Omit<AriaFileTriggerProps, "className" | "style">,
    Pick<DropZoneProps, "isDisabled"> {
  style?: stylex.StyleXStyles | Array<stylex.StyleXStyles>;
  onAddFiles?: (files: Array<File>) => void;
}

export const FileDropZone = ({
  children,
  style,
  onAddFiles,
  isDisabled,
  acceptedFileTypes,
  ...props
}: FileDropZoneProps) => {
  return (
    <DropZone
      {...stylex.props(styles.dropZone, style)}
      isDisabled={isDisabled}
      onDrop={(e) => {
        void getFiles(e.items).then((files) => {
          if (!acceptedFileTypes || acceptedFileTypes.length === 0) {
            onAddFiles?.(files);
            return;
          }
          const matched = files.filter((file) =>
            acceptedFileTypes.some((type) =>
              fileMatchesAcceptedType(file, type),
            ),
          );
          onAddFiles?.(matched);
        });
      }}
      getDropOperation={(types) => {
        if (!acceptedFileTypes) return "copy";
        return hasAcceptedDropType(acceptedFileTypes, types)
          ? "copy"
          : "cancel";
      }}
    >
      {({ isDropTarget }) => {
        if (isDropTarget) {
          return "Drop to upload";
        }

        return (
          <AriaFileTrigger
            {...props}
            acceptedFileTypes={acceptedFileTypes}
            onSelect={(files) => {
              // eslint-disable-next-line unicorn/prefer-spread
              onAddFiles?.(Array.from(files ?? []));
            }}
          >
            {children}
          </AriaFileTrigger>
        );
      }}
    </DropZone>
  );
};

interface FileDropDefaultTriggerProps extends StyleXComponentProps<ButtonProps> {}

export const FileDropDefaultTrigger = ({
  children,
  style,
  ...props
}: FileDropDefaultTriggerProps) => {
  return (
    <Button
      {...stylex.props(styles.defaultTrigger, ui.bgGhost, style)}
      {...props}
    >
      {children}
    </Button>
  );
};
