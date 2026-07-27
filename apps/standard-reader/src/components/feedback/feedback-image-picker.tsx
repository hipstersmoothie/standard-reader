"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { FileDropZone } from "@standard-reader/design-system/file-drop-zone";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { ProgressCircle } from "@standard-reader/design-system/progress-circle";
import { TextField } from "@standard-reader/design-system/text-field";
import {
  animationDuration,
  animationTimingFunction,
} from "@standard-reader/design-system/theme/animations.stylex";
import {
  criticalColor,
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { mediaQueries } from "@standard-reader/design-system/theme/media-queries.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { userinputApi } from "#/integrations/tanstack-query/api-userinput.functions";
import type { FeedbackImageDraft } from "#/lib/userinput/feedback-image-draft";
import {
  PrepareImageError,
  prepareFeedbackImage,
} from "#/lib/userinput/prepare-image";
import {
  FEEDBACK_IMAGE_ALT_MAX_LENGTH,
  FEEDBACK_IMAGE_MAX_COUNT,
  FEEDBACK_IMAGE_MIME_TYPES,
} from "#/lib/userinput/space";

const styles = stylex.create({
  root: {
    width: "100%",
  },
  row: {
    width: "100%",
  },
  // Landscape, because screenshots are: a square crop of a window shot is a
  // meaningless slice of chrome, where 3:2 shows enough to recognize.
  thumbWrap: {
    backgroundColor: uiColor.bgSubtle,
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    flexShrink: 0,
    height: spacing["12"],
    overflow: "hidden",
    position: "relative",
    width: spacing["20"],
  },
  thumb: {
    height: "100%",
    objectFit: "cover",
    transitionDuration: {
      default: animationDuration.default,
      [mediaQueries.reducedMotion]: "0s",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: animationTimingFunction.easeInOut,
    width: "100%",
  },
  thumbBusy: {
    opacity: 0.35,
  },
  thumbFailed: {
    opacity: 0.4,
  },
  spinner: {
    inset: 0,
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    position: "absolute",
  },
  field: {
    flexGrow: 1,
    minWidth: 0,
  },
  errorText: {
    color: criticalColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  // Matched to the form fields above it: the design-system drop zone defaults to
  // a 2px `border3` dash at `radius.lg`, which reads as a much heavier, darker
  // line than the 1px `border1` at `radius.md` every input in this dialog uses.
  // The drop-target and focus conditions are restated because a flat
  // `borderColor` would otherwise replace the whole conditional.
  dropZone: {
    // Solid `border1` with a `border2` hover — the exact border treatment the
    // text fields above use, so the zone reads as another field in the form.
    // The dashed default is dropped; the drop-target tint carries the "you can
    // drop here" signal on its own.
    borderColor: {
      default: uiColor.border1,
      ":is(:hover)": uiColor.border2,
      ":is([data-drop-target])": primaryColor.solid1,
      ":is([data-focus-visible])": focusColor.ring,
    },
    borderStyle: "solid",
    // Idle fill matches the inputs (`uiColor.bg`) rather than the design
    // system's `bgSubtle`, so at rest the zone reads as another field in the
    // form instead of a tinted panel. The drop-target tint is kept.
    backgroundColor: {
      default: uiColor.bg,
      ":is([data-drop-target])": primaryColor.component1,
    },
    borderRadius: radius.md,
    borderWidth: 1,
    // Fixed, not padding-derived: the zone is the drop target, so it should
    // stay a stable, generous surface as rows are added above it rather than
    // shrinking to fit its own label.
    boxSizing: "border-box",
    gap: gap.lg,
    height: spacing["28"],
    paddingBottom: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    width: "100%",

    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  dropLabel: {
    textAlign: "center",
  },
  hint: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
});

export interface FeedbackImagePickerProps {
  images: Array<FeedbackImageDraft>;
  setImages: React.Dispatch<React.SetStateAction<Array<FeedbackImageDraft>>>;
  isDisabled?: boolean;
}

/**
 * Attach up to four screenshots to a piece of feedback.
 *
 * Uploads run as soon as a file lands, not at submit time — the blobs go to the
 * reader's own PDS under the `blob` scope they already hold, so the refs are in
 * hand before we know whether the discussion-scope OAuth upgrade is needed.
 * Oversized images are downscaled in the browser first (see
 * `prepareFeedbackImage`); the lexicon caps each blob at 1 MB.
 */
export function FeedbackImagePicker({
  images,
  setImages,
  isDisabled,
}: FeedbackImagePickerProps) {
  const { t } = useLingui();
  // Revoked on unmount only: doing it inside the state updater would fire twice
  // under StrictMode's double-invoked updaters and kill a live preview.
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const remaining = FEEDBACK_IMAGE_MAX_COUNT - images.length;

  /**
   * `prepareFeedbackImage` throws codes rather than sentences (it's a pure
   * module with no `i18n` instance), so the reader-facing copy is written here.
   */
  const messageFor = (error: unknown): string => {
    if (error instanceof PrepareImageError) {
      switch (error.code) {
        case "gif-too-large": {
          return t`That GIF is over 1 MB. Try a shorter clip, or attach a still image.`;
        }
        case "unreadable": {
          return t`That file isn't an image we can read.`;
        }
        case "too-large": {
          return t`That image is too detailed to fit under 1 MB. Try cropping it first.`;
        }
        default: {
          return t`Could not read that file.`;
        }
      }
    }
    return error instanceof Error
      ? error.message
      : t`Could not upload that image.`;
  };

  const upload = (id: string, file: File) => {
    void (async () => {
      try {
        const prepared = await prepareFeedbackImage(file);
        const { blob } = await userinputApi.uploadFeedbackImage({
          data: {
            dataBase64: prepared.dataBase64,
            mimeType: prepared.mimeType,
          },
        });
        setImages((prev) =>
          prev.map((image) =>
            image.id === id ? { ...image, blob, error: null } : image,
          ),
        );
      } catch (error) {
        const message = messageFor(error);
        setImages((prev) =>
          prev.map((image) =>
            image.id === id ? { ...image, error: message } : image,
          ),
        );
      }
    })();
  };

  const addFiles = (files: Array<File>) => {
    const accepted = files.slice(0, Math.max(0, remaining));
    if (accepted.length === 0) return;

    const entries = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        alt: "",
        blob: null,
        error: null,
        file,
        id: crypto.randomUUID(),
        previewUrl,
      } satisfies FeedbackImageDraft;
    });
    setImages((prev) => [...prev, ...entries]);
    for (const entry of entries) upload(entry.id, entry.file);
  };

  const retry = (image: FeedbackImageDraft) => {
    setImages((prev) =>
      prev.map((entry) =>
        entry.id === image.id ? { ...entry, error: null } : entry,
      ),
    );
    upload(image.id, image.file);
  };

  return (
    <Flex direction="column" gap="lg" style={styles.root}>
      {images.map((image, index) => {
        const isUploading = !image.blob && !image.error;
        const position = index + 1;
        return (
          <Flex key={image.id} direction="column" gap="xs" style={styles.row}>
            <Flex align="center" gap="lg" style={styles.row}>
              <div {...stylex.props(styles.thumbWrap)}>
                <img
                  src={image.previewUrl}
                  alt=""
                  {...stylex.props(
                    styles.thumb,
                    isUploading && styles.thumbBusy,
                    Boolean(image.error) && styles.thumbFailed,
                  )}
                />
                {isUploading ? (
                  <div {...stylex.props(styles.spinner)}>
                    <ProgressCircle
                      size="sm"
                      isIndeterminate
                      aria-label={t`Uploading ${image.file.name}`}
                    />
                  </div>
                ) : null}
              </div>
              <TextField
                aria-label={t`Description for image ${position}`}
                placeholder={t`Describe this image`}
                value={image.alt}
                onChange={(alt) =>
                  setImages((prev) =>
                    prev.map((entry) =>
                      entry.id === image.id ? { ...entry, alt } : entry,
                    ),
                  )
                }
                maxLength={FEEDBACK_IMAGE_ALT_MAX_LENGTH}
                isDisabled={isDisabled || Boolean(image.error)}
                style={styles.field}
              />
              <IconButton
                variant="tertiary"
                label={t`Remove image ${position}`}
                isDisabled={isDisabled}
                onPress={() =>
                  setImages((prev) =>
                    prev.filter((entry) => entry.id !== image.id),
                  )
                }
              >
                <X size={16} aria-hidden />
              </IconButton>
            </Flex>
            {image.error ? (
              <Flex align="center" gap="md" wrap>
                <span {...stylex.props(styles.errorText)}>{image.error}</span>
                <Button
                  variant="tertiary"
                  size="sm"
                  isDisabled={isDisabled}
                  onPress={() => retry(image)}
                >
                  <RotateCcw size={13} aria-hidden />
                  <Trans>Try again</Trans>
                </Button>
              </Flex>
            ) : null}
          </Flex>
        );
      })}

      {remaining > 0 ? (
        <FileDropZone
          acceptedFileTypes={[...FEEDBACK_IMAGE_MIME_TYPES]}
          allowsMultiple
          isDisabled={isDisabled}
          onAddFiles={addFiles}
          style={styles.dropZone}
        >
          <span {...stylex.props(styles.dropLabel)}>
            {images.length === 0 ? (
              <Trans>Drop screenshots here</Trans>
            ) : (
              <Trans>Drop another screenshot</Trans>
            )}
          </span>
          {/* A real, labelled button rather than `FileDropDefaultTrigger`:
              the default trigger is an invisible overlay that ghosts in at 50%
              opacity on hover, which reads as an artifact rather than a
              control. `FileTrigger` fires on any react-aria Button child. */}
          <Button variant="secondary" size="sm" isDisabled={isDisabled}>
            <Trans>Choose files</Trans>
          </Button>
        </FileDropZone>
      ) : null}

      <span {...stylex.props(styles.hint)}>
        {images.length === 0 ? (
          <Trans>
            Up to four screenshots. Large ones are resized before they upload.
          </Trans>
        ) : (
          <Trans>
            {images.length} of {FEEDBACK_IMAGE_MAX_COUNT} attached. Descriptions
            are optional, and help readers who use a screen reader.
          </Trans>
        )}
      </span>
    </Flex>
  );
}
