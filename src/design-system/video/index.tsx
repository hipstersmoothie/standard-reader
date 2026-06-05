"use client";

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import {
  MediaCaptionsButton,
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";

import type { StyleXComponentProps } from "../theme/types";

import { primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  horizontalSpace,
  size,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily } from "../theme/typography.stylex";

const DEFAULT_SEEK_OFFSET = 10;
const CAPTION_CONTROLS_VISIBLE_OFFSET = `calc(${size.xl} + (${verticalSpace.lg} * 2) + ${verticalSpace["2xl"]})`;
const CAPTION_CONTROLS_HIDDEN_OFFSET = verticalSpace["2xl"];
type VideoTrackKind =
  | "captions"
  | "chapters"
  | "descriptions"
  | "metadata"
  | "subtitles";
type VideoMediaTag =
  | "cloudflare-video"
  | "dash-video"
  | "hls-video"
  | "jwplayer-video"
  | "mux-video"
  | "shaka-video"
  | "video"
  | "video-js-video"
  | "vimeo-video"
  | "wistia-video"
  | "youtube-video";

const styles = stylex.create({
  root: {
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: "inherit",
    position: "relative",
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  rounded: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  controller: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  controllerTheme: {
    "--media-button-icon-height": size.xl,
    "--media-button-icon-width": size.xl,
    "--media-button-padding": horizontalSpace.lg,
    "--media-control-height": size["xl"],
    "--media-control-hover-background": uiColor.component2,
    "--media-control-padding": verticalSpace.lg,
    "--media-icon-color": uiColor.text1,
    "--media-primary-color": primaryColor.solid1,
    "--media-range-track-background": uiColor.border3,
    "--media-range-track-height": "4px",
    "--media-secondary-color": uiColor.bgSubtle,
    "--media-text-color": uiColor.text2,
    "--media-tooltip-background-color": uiColor.bgSubtle,
    "--media-tooltip-border": `1px solid ${uiColor.border1}`,
    "--media-tooltip-border-radius": radius.xs,
    "--media-tooltip-padding": `${verticalSpace.xs} ${horizontalSpace.md}`,
    opacity: {
      "[slot='media']::-webkit-media-text-track-display": 0,
    },
    transform: {
      "[slot='media']::-webkit-media-text-track-display": "translateY(200%)",
    },
  },
  media: {
    display: "block",
    objectFit: "contain",
    height: "100%",
    width: "100%",
  },
  aspectRatio: (aspectRatio: number) => ({
    aspectRatio,
  }),
  subtitleOverlay: (subtitleOffset: string) => ({
    position: "absolute",
    left: horizontalSpace["2xl"],
    right: horizontalSpace["2xl"],
    bottom: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    transform: `translateY(calc(-1 * ${subtitleOffset}))`,
    transitionDelay: "0.05s",
    transitionDuration: "0.15s",
    transitionProperty: "transform",
    transitionTimingFunction: "linear",
    zIndex: 1,
  }),
  subtitleText: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: radius.sm,
    color: "white",
    fontSize: size.lg,
    fontFamily: fontFamily["sans"],
    lineHeight: 1.4,
    maxWidth: "100%",
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
    paddingBottom: verticalSpace.sm,
    textAlign: "center",
    whiteSpace: "pre-wrap",
  },
});

function getMediaTag(src?: string, mediaType?: VideoMediaTag): VideoMediaTag {
  if (mediaType) {
    return mediaType;
  }

  if (!src) {
    return "video";
  }

  const normalizedSrc = src.toLowerCase();

  if (
    normalizedSrc.includes("iframe.videodelivery.net") ||
    (normalizedSrc.includes("customer-") &&
      normalizedSrc.includes(".cloudflarestream.com"))
  ) {
    return "cloudflare-video";
  }

  if (normalizedSrc.includes(".mpd")) {
    return "dash-video";
  }

  if (
    normalizedSrc.includes(".m3u8") ||
    normalizedSrc.includes("getvideoplaylist")
  ) {
    return "hls-video";
  }

  if (
    normalizedSrc.includes("jwplayer.com") ||
    normalizedSrc.includes("jwplatform.com")
  ) {
    return "jwplayer-video";
  }

  if (normalizedSrc.includes("stream.mux.com")) {
    return "mux-video";
  }

  if (
    normalizedSrc.includes("player.vimeo.com") ||
    normalizedSrc.includes("vimeo.com")
  ) {
    return "vimeo-video";
  }

  if (
    normalizedSrc.includes("fast.wistia.com") ||
    normalizedSrc.includes("wistia.com") ||
    normalizedSrc.includes("wistia.net")
  ) {
    return "wistia-video";
  }

  if (
    normalizedSrc.includes("youtube.com") ||
    normalizedSrc.includes("youtube-nocookie.com") ||
    normalizedSrc.includes("youtu.be")
  ) {
    return "youtube-video";
  }

  return "video";
}

/**
 * A subtitle or caption track rendered as a native `<track>` element.
 */
export interface VideoSubtitleTrack {
  /**
   * Whether this track should be enabled by default.
   */
  default?: boolean;
  /**
   * Optional stable identifier for React keys.
   */
  id?: string;
  /**
   * The text track kind.
   * @default "subtitles"
   */
  kind?: VideoTrackKind;
  /**
   * The user-facing label shown in the captions menu.
   */
  label: string;
  /**
   * The WebVTT file URL for this track.
   */
  src: string;
  /**
   * The BCP-47 language tag for this track.
   */
  srcLang: string;
}

/**
 * An audio track shown in the audio track menu.
 */
export interface VideoAudioTrack {
  /**
   * Whether this track should be selected by default.
   */
  enabled?: boolean;
  /**
   * Optional stable identifier for the track.
   */
  id?: string;
  /**
   * The media track kind.
   * @default "metadata"
   */
  kind?: VideoTrackKind;
  /**
   * The user-facing label shown in the audio track menu.
   */
  label: string;
  /**
   * The language code associated with this track.
   */
  language?: string;
  /**
   * An optional source URL to swap in when this track is selected.
   */
  src?: string;
}

/**
 * Props for the Video component.
 */
export interface VideoProps extends StyleXComponentProps<
  Omit<React.ComponentProps<"video">, "children" | "controls" | "style">
> {
  /**
   * The aspect ratio reserved for the player.
   * This helps prevent layout shift while the video metadata loads.
   * @default 16 / 9
   */
  aspectRatio?: number;
  /**
   * Whether the player should use rounded corners.
   * @default true
   */
  rounded?: boolean;
  /**
   * The number of seconds to skip when using the seek controls.
   * @default 10
   */
  seekOffset?: number;
  /**
   * Optional custom Media Chrome controls.
   * When omitted, the component renders a default control bar.
   */
  children?: React.ReactNode;
  /**
   * Subtitle and caption tracks rendered inside the media element.
   */
  subtitleTracks?: Array<VideoSubtitleTrack>;
  /**
   * Override the Media Chrome media element used by the player.
   * When omitted, the component will infer common providers from `src`
   * and otherwise fall back to the native `video` element.
   */
  mediaType?: VideoMediaTag;
  /**
   * Vertical spacing for the custom subtitle layer.
   * @default CAPTION_CONTROLS_VISIBLE_OFFSET while controls are visible,
   * CAPTION_CONTROLS_HIDDEN_OFFSET otherwise
   */
  subtitleOffset?: string;
}

type SubtitleMediaElement = HTMLElement & {
  textTracks?: TextTrackList;
};

interface UseVideoSubtitlesOptions {
  rootRef: React.RefObject<HTMLDivElement | null>;
  mediaRef: React.RefObject<SubtitleMediaElement | null>;
  src?: string;
  subtitleTracks: Array<VideoSubtitleTrack>;
}

function isSubtitleTrack(track: TextTrack): boolean {
  return track.kind === "captions" || track.kind === "subtitles";
}

function getActiveCueText(track: TextTrack): string {
  const activeCues = track.activeCues;

  if (!activeCues?.length) {
    return "";
  }

  return Array.from(activeCues)
    .map((cue) => {
      if ("text" in cue && typeof cue.text === "string") {
        return cue.text.trim();
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function useVideoSubtitles({
  rootRef,
  mediaRef,
  src,
  subtitleTracks,
}: UseVideoSubtitlesOptions) {
  const hasSubtitleTracks = subtitleTracks.length > 0;
  const [activeSubtitleText, setActiveSubtitleText] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const defaultCaptionsEnabled = subtitleTracks.some((track) => track.default);
  const [captionsEnabled, setCaptionsEnabled] = useState(
    defaultCaptionsEnabled,
  );
  const defaultSubtitleTrackIndex = subtitleTracks.findIndex(
    (track) => track.default,
  );
  const selectedSubtitleTrackIndex =
    defaultSubtitleTrackIndex >= 0 ? defaultSubtitleTrackIndex : 0;

  useEffect(() => {
    setCaptionsEnabled(hasSubtitleTracks && defaultCaptionsEnabled);
    setActiveSubtitleText("");
  }, [defaultCaptionsEnabled, hasSubtitleTracks, src]);

  useEffect(() => {
    const captionsButton = rootRef.current?.querySelector(
      "media-captions-button",
    );

    if (!captionsButton) {
      return;
    }

    captionsButton.setAttribute("aria-checked", String(captionsEnabled));
  }, [captionsEnabled, rootRef]);

  useEffect(() => {
    const controller = rootRef.current?.querySelector("media-controller");

    if (!controller || !hasSubtitleTracks) {
      return;
    }

    const stopNativeSubtitleToggle = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setCaptionsEnabled((enabled) => !enabled);
    };

    const showCustomSubtitles = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setCaptionsEnabled(true);
    };

    const hideCustomSubtitles = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setCaptionsEnabled(false);
    };

    controller.addEventListener(
      "mediatogglesubtitlesrequest",
      stopNativeSubtitleToggle,
      true,
    );
    controller.addEventListener(
      "mediashowsubtitlesrequest",
      showCustomSubtitles,
      true,
    );
    controller.addEventListener(
      "mediadisablesubtitlesrequest",
      hideCustomSubtitles,
      true,
    );

    return () => {
      controller.removeEventListener(
        "mediatogglesubtitlesrequest",
        stopNativeSubtitleToggle,
        true,
      );
      controller.removeEventListener(
        "mediashowsubtitlesrequest",
        showCustomSubtitles,
        true,
      );
      controller.removeEventListener(
        "mediadisablesubtitlesrequest",
        hideCustomSubtitles,
        true,
      );
    };
  }, [hasSubtitleTracks, rootRef]);

  useEffect(() => {
    const controller = rootRef.current?.querySelector("media-controller");

    if (!controller) {
      return;
    }

    const syncControlsVisibility = () => {
      setControlsVisible(!controller.hasAttribute("userinactive"));
    };

    syncControlsVisibility();

    const observer = new MutationObserver(syncControlsVisibility);
    observer.observe(controller, {
      attributeFilter: ["userinactive"],
      attributes: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [rootRef]);

  useEffect(() => {
    const media = mediaRef.current;
    const textTracks = media?.textTracks;

    if (!textTracks) {
      setActiveSubtitleText("");
      return;
    }

    const cueListeners = new Map<TextTrack, () => void>();

    const removeCueListeners = () => {
      for (const [track, listener] of cueListeners) {
        track.removeEventListener("cuechange", listener);
      }
      cueListeners.clear();
    };

    const syncSubtitleState = () => {
      const availableSubtitleTracks =
        Array.from(textTracks).filter(isSubtitleTrack);
      const selectedTrack =
        captionsEnabled &&
        selectedSubtitleTrackIndex < availableSubtitleTracks.length
          ? availableSubtitleTracks[selectedSubtitleTrackIndex]
          : null;

      for (const track of availableSubtitleTracks) {
        track.mode = track === selectedTrack ? "hidden" : "disabled";
      }

      setActiveSubtitleText(
        selectedTrack ? getActiveCueText(selectedTrack) : "",
      );
    };

    const bindCueListeners = () => {
      removeCueListeners();

      for (const track of Array.from(textTracks).filter(isSubtitleTrack)) {
        track.addEventListener("cuechange", syncSubtitleState);
        cueListeners.set(track, syncSubtitleState);
      }
    };

    const handleTrackListChange = () => {
      bindCueListeners();
      syncSubtitleState();
    };

    handleTrackListChange();

    media.addEventListener("loadedmetadata", handleTrackListChange);
    textTracks.addEventListener("addtrack", handleTrackListChange);
    textTracks.addEventListener("change", syncSubtitleState);
    textTracks.addEventListener("removetrack", handleTrackListChange);

    return () => {
      media.removeEventListener("loadedmetadata", handleTrackListChange);
      textTracks.removeEventListener("addtrack", handleTrackListChange);
      textTracks.removeEventListener("change", syncSubtitleState);
      textTracks.removeEventListener("removetrack", handleTrackListChange);
      removeCueListeners();
    };
  }, [captionsEnabled, mediaRef, selectedSubtitleTrackIndex, src]);

  return {
    activeSubtitleText,
    controlsVisible,
    hasSubtitleTracks,
  };
}

export function Video({
  children,
  preload = "metadata",
  rounded = true,
  seekOffset = DEFAULT_SEEK_OFFSET,
  style,
  aspectRatio = 16 / 9,
  mediaType,
  subtitleTracks = [],
  subtitleOffset,
  ...props
}: VideoProps) {
  const { src, ...videoProps } = props;
  const mediaTag = getMediaTag(src, mediaType);
  const MediaTag = mediaTag as unknown as React.ElementType;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<SubtitleMediaElement | null>(null);
  const { activeSubtitleText, controlsVisible, hasSubtitleTracks } =
    useVideoSubtitles({
      rootRef,
      mediaRef,
      src,
      subtitleTracks,
    });
  const resolvedSubtitleOffset =
    subtitleOffset ??
    (controlsVisible
      ? CAPTION_CONTROLS_VISIBLE_OFFSET
      : CAPTION_CONTROLS_HIDDEN_OFFSET);

  return (
    <div
      ref={rootRef}
      {...stylex.props(styles.root, rounded && styles.rounded, ui.bgDim, style)}
    >
      <MediaController
        {...stylex.props(styles.controller, styles.controllerTheme)}
      >
        {/* Caption tracks are app-specific, so the wrapper forwards native video props instead of forcing a track API. */}
        {/* oxlint-disable-next-line jsx_a11y/media-has-caption */}
        <MediaTag
          ref={mediaRef}
          data-custom-subtitle-renderer
          {...videoProps}
          preload={preload}
          slot="media"
          src={src}
          {...stylex.props(styles.media, styles.aspectRatio(aspectRatio))}
        >
          {subtitleTracks.map((track) => (
            <track
              key={track.id ?? track.src}
              kind={track.kind ?? "subtitles"}
              label={track.label}
              src={track.src}
              srcLang={track.srcLang}
            />
          ))}
        </MediaTag>
        {children ?? (
          <MediaControlBar>
            <MediaPlayButton />
            <MediaSeekBackwardButton seekOffset={seekOffset} />
            <MediaSeekForwardButton seekOffset={seekOffset} />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration />
            <MediaMuteButton />
            <MediaVolumeRange />
            {hasSubtitleTracks ? <MediaCaptionsButton /> : null}
            <MediaPlaybackRateButton />
            <MediaFullscreenButton />
          </MediaControlBar>
        )}
      </MediaController>
      {activeSubtitleText ? (
        <div {...stylex.props(styles.subtitleOverlay(resolvedSubtitleOffset))}>
          <div {...stylex.props(styles.subtitleText)}>{activeSubtitleText}</div>
        </div>
      ) : null}
    </div>
  );
}
