/**
 * Reader voice preference shared types/helpers.
 *
 * Persisted as `auto` or a Kokoro voice id in the `standard-reader-voice` cookie
 * (SSR for everyone). Signed-in users also store a voice id on `user.reader_voice`
 * (`null` = auto).
 */

import type { ReaderVoice } from "#/lib/page-reader/voice-catalog";

import { nameVoice } from "#/lib/page-reader/voice";
import {
  AMERICAN_ENGLISH_VOICE_IDS,
  readerVoiceLabel,
} from "#/lib/page-reader/voice-catalog";

export type ReaderVoicePreference = "auto" | ReaderVoice;

export const DEFAULT_READER_VOICE_PREFERENCE: ReaderVoicePreference = "auto";

export const READER_VOICE_COOKIE = "standard-reader-voice";

export const READER_VOICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const READER_VOICE_PREFERENCES = [
  "auto",
  ...AMERICAN_ENGLISH_VOICE_IDS,
] as const;

export function isReaderVoice(value: unknown): value is ReaderVoice {
  return (
    typeof value === "string" &&
    (AMERICAN_ENGLISH_VOICE_IDS as ReadonlyArray<string>).includes(value)
  );
}

export function isReaderVoicePreference(
  value: unknown,
): value is ReaderVoicePreference {
  return value === "auto" || isReaderVoice(value);
}

export function parseReaderVoicePreference(
  value: unknown,
): ReaderVoicePreference {
  return isReaderVoicePreference(value)
    ? value
    : DEFAULT_READER_VOICE_PREFERENCE;
}

export function readerVoicePreferenceToDbValue(
  preference: ReaderVoicePreference,
): ReaderVoice | null {
  return preference === "auto" ? null : preference;
}

export function dbValueToReaderVoicePreference(
  value: string | null | undefined,
): ReaderVoicePreference {
  return isReaderVoice(value) ? value : DEFAULT_READER_VOICE_PREFERENCE;
}

export function readerVoicePreferenceLabel(
  preference: ReaderVoicePreference,
): string {
  return preference === "auto" ? "Auto" : readerVoiceLabel(preference);
}

/** Resolve a stored preference to a Kokoro voice (auto runs name detection). */
export function resolveReaderVoicePreference(
  author: string | null,
  preference: ReaderVoicePreference,
): ReaderVoice | Promise<ReaderVoice> {
  if (preference !== "auto") return preference;
  return nameVoice(author);
}
