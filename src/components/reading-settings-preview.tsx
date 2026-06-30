"use client";

import type { ReaderVoice } from "#/lib/page-reader/voice-catalog";
import type { ReaderVoicePreference } from "#/lib/reader-voice";

import * as stylex from "@stylexjs/stylex";
import {
  articleBodyStyles,
  articleMeasureStyle,
  readingBodyStyleProps,
  readingDropCapStyleProps,
} from "#/components/reader/content/body-styles";
import { ReadingCustomFontLoader } from "#/components/reading-custom-font-loader";
import { loadKokoro } from "#/lib/page-reader/kokoro-loader";
import { nameVoice } from "#/lib/page-reader/voice";
import { readingCustomFontFamily } from "#/lib/reading-typography";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { Pause, Play } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { ProgressCircle } from "../design-system/progress-circle";
import { criticalColor, uiColor } from "../design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";

const PREVIEW_DROP_CAP = "L";
const PREVIEW_PARAGRAPH_1 =
  "ong-form writing deserves room to breathe—a comfortable column, steady rhythm, and prose you can settle into.";
const PREVIEW_PARAGRAPH_2 =
  "Adjust type size, column width, and font until the page feels right. Tap play to hear how articles will sound when you listen instead of read.";

/** Plaintext passed to TTS — must match the visible preview copy. */
const PREVIEW_AUDIO_TEXT = `${PREVIEW_DROP_CAP}${PREVIEW_PARAGRAPH_1} ${PREVIEW_PARAGRAPH_2}`;

type PreviewStatus = "idle" | "loading" | "playing" | "error";

const styles = stylex.create({
  card: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    marginBottom: verticalSpace["3xl"],
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  label: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace.none,
  },
  article: {
    marginBottom: verticalSpace["3xl"],
    marginLeft: "auto",
    marginRight: "auto",
    width: "100%",
  },
  previewBody: {
    marginTop: verticalSpace.none,
  },
  lastParagraph: {
    marginBottom: verticalSpace.none,
  },
  audioRow: {
    alignItems: {
      default: "center",
      "@media (max-width: 47.5rem)": "stretch",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      default: "row",
      "@media (max-width: 47.5rem)": "column",
    },
    rowGap: gap.lg,
  },
  audioCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  audioError: {
    color: criticalColor.text1,
  },
  buttonIcon: {
    flexShrink: 0,
    position: "relative",
    height: spacing["3.5"],
    width: spacing["3.5"],
  },
  buttonIconLayer: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  buttonIconHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  spinnerSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    height: spacing["3.5"],
    width: spacing["3.5"],
  },
  spinnerHidden: {
    opacity: 0,
    visibility: "hidden",
  },
});

async function resolvePreviewVoice(
  preference: ReaderVoicePreference,
): Promise<ReaderVoice> {
  if (preference !== "auto") return preference;
  return nameVoice("Alexandra");
}

export function ReadingSettingsPreview({
  voicePreference,
}: {
  voicePreference: ReaderVoicePreference;
}) {
  const { preference: typography } = useReadingTypography();
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef<PreviewStatus>("idle");
  const runIdRef = useRef(0);
  const audioRef = useRef<{
    context: AudioContext;
    source: AudioBufferSourceNode;
  } | null>(null);

  const stopPreview = useCallback(() => {
    runIdRef.current += 1;
    const active = audioRef.current;
    audioRef.current = null;
    if (active) {
      try {
        active.source.stop();
      } catch {
        // Already stopped.
      }
      void active.context.close();
    }
    statusRef.current = "idle";
    startTransition(() => {
      setStatus("idle");
      setErrorMessage(null);
    });
  }, []);

  useEffect(() => {
    stopPreview();
  }, [voicePreference, stopPreview]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const playPreview = useCallback(async () => {
    if (statusRef.current === "playing" || statusRef.current === "loading") {
      stopPreview();
      return;
    }

    const runId = ++runIdRef.current;
    statusRef.current = "loading";
    startTransition(() => {
      setStatus("loading");
      setErrorMessage(null);
    });

    try {
      const [tts, voice] = await Promise.all([
        loadKokoro(),
        resolvePreviewVoice(voicePreference),
      ]);
      if (runId !== runIdRef.current) return;

      const raw = await tts.generate(PREVIEW_AUDIO_TEXT, { voice, speed: 1 });
      if (runId !== runIdRef.current) return;

      const context = new AudioContext();
      // kokoro-js v4 types `raw.audio` as `Float32Array | Float32Array[]`.
      const audio = Array.isArray(raw.audio) ? raw.audio[0] : raw.audio;
      if (!audio) return;
      const buffer = context.createBuffer(1, audio.length, raw.sampling_rate);
      buffer.getChannelData(0).set(audio);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.addEventListener("ended", () => {
        if (runId === runIdRef.current) {
          audioRef.current = null;
          statusRef.current = "idle";
          startTransition(() => setStatus("idle"));
        }
      });
      audioRef.current = { context, source };
      source.start();
      statusRef.current = "playing";
      requestAnimationFrame(() => {
        if (runId !== runIdRef.current) return;
        startTransition(() => setStatus("playing"));
      });
    } catch {
      if (runId !== runIdRef.current) return;
      statusRef.current = "error";
      startTransition(() => {
        setStatus("error");
        setErrorMessage("Couldn’t play the voice sample.");
      });
    }
  }, [stopPreview, voicePreference]);

  return (
    <div {...stylex.props(styles.card)}>
      <ReadingCustomFontLoader family={readingCustomFontFamily(typography)} />
      <p {...stylex.props(styles.label)}>Preview</p>

      <article
        {...stylex.props(styles.article, articleMeasureStyle(typography))}
      >
        <div {...readingBodyStyleProps(typography, false, styles.previewBody)}>
          <p
            {...stylex.props(
              articleBodyStyles.paragraph,
              articleBodyStyles.dropCapParagraph,
            )}
          >
            <span {...readingDropCapStyleProps(typography)} aria-hidden>
              {PREVIEW_DROP_CAP}
            </span>
            {PREVIEW_PARAGRAPH_1}
          </p>
          <p
            {...stylex.props(articleBodyStyles.paragraph, styles.lastParagraph)}
          >
            {PREVIEW_PARAGRAPH_2}
          </p>
        </div>
      </article>

      <div {...stylex.props(styles.audioRow)}>
        <Flex align="center" gap="md">
          <Button
            variant="secondary"
            isDisabled={status === "loading"}
            onPress={() => void playPreview()}
          >
            <span {...stylex.props(styles.buttonIcon)} aria-hidden>
              <span
                {...stylex.props(
                  styles.buttonIconLayer,
                  status === "playing" ? styles.buttonIconHidden : undefined,
                )}
              >
                <Play size={14} />
              </span>
              <span
                {...stylex.props(
                  styles.buttonIconLayer,
                  status === "playing" ? undefined : styles.buttonIconHidden,
                )}
              >
                <Pause size={14} />
              </span>
            </span>
            {status === "playing" ? "Stop sample" : "Play voice sample"}
          </Button>
          <div
            {...stylex.props(
              styles.spinnerSlot,
              status === "loading" ? undefined : styles.spinnerHidden,
            )}
            aria-hidden={status === "loading" ? undefined : true}
          >
            <ProgressCircle
              isIndeterminate
              size="sm"
              aria-label="Loading voice sample"
            />
          </div>
        </Flex>
        {status === "error" && errorMessage ? (
          <p {...stylex.props(styles.audioCaption, styles.audioError)}>
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
