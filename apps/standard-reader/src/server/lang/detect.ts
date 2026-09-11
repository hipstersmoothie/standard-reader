/**
 * The language tagger.
 *
 * Trigram detection (`franc`) over a cleaned prose sample, restricted to the
 * closed vocabulary in `#/lib/content-language`, with two things layered on
 * top that the raw library does not give us:
 *
 * 1. **A CJK pre-gate.** franc cannot tell Chinese from Japanese: its `jpn`
 *    pattern covers Han as well as kana, and it picks whichever pattern matches
 *    more characters — so a Chinese article containing a single katakana
 *    character outscores `cmn` and comes back Japanese. Kana and Hangul are the
 *    real evidence and they appear in no other language, so this settles the
 *    three CJK languages itself and never asks franc about them.
 * 2. **A chunk vote instead of a single verdict.** The sample is split into
 *    windows, each is detected independently, and the winner is the majority —
 *    with the confidence being how much of the document agreed. A single franc
 *    call returns a normalized distance that is always `1` for the winner,
 *    which says nothing about how close the runner-up was and so cannot be used
 *    as a confidence. Agreement across windows is a number that means
 *    something: an English post quoting three paragraphs of German scores low,
 *    and *should*.
 *
 * The result feeds `documents.lang`, which the reader's language filter matches
 * on. Nothing here writes to a repo — the language is our derivation, not a
 * claim the author made.
 */

import { francAll } from "franc";

import type { ContentLanguageCode } from "#/lib/content-language";
import {
  DETECTABLE_ISO_639_3,
  contentLanguageFromIso639_3,
} from "#/lib/content-language";

import type { DocumentTextParts } from "./sample.ts";
import {
  MIN_SAMPLE_LENGTH,
  documentLanguageSample,
  letterCount,
  proseLength,
} from "./sample.ts";

/** Hiragana, Katakana, halfwidth Katakana. Present only in Japanese. */
const KANA = /[぀-ゟ゠-ヿｦ-ﾝ]/gu;
/** Hangul jamo, compatibility jamo, syllables. Present only in Korean. */
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/gu;
/** CJK ideographs — shared by Chinese, Japanese, and (rarely) Korean. */
const HAN = /[㐀-䶿一-鿿豈-﫿]/gu;

/** The detector's allowlist, hoisted so it isn't rebuilt per chunk. */
const ONLY: Array<string> = [...DETECTABLE_ISO_639_3];

/**
 * Windows the chunk vote splits a sample into.
 *
 * Kept small on purpose. franc's distance is a sum over a text's top trigrams
 * normalized by raw length, which means its verdict gets *less* reliable as a
 * passage gets longer and more mixed: 560 characters of English followed by 190
 * of German is reported as German. Short windows keep each vote close to
 * monolingual and let the majority — not franc's arithmetic — resolve the mix.
 */
const CHUNK_LENGTH = 350;

/** Never take more than this many windows — a longread doesn't need 40 votes. */
const MAX_CHUNKS = 16;

/**
 * A trailing window shorter than this is dropped rather than given a full vote:
 * the last slice of a sample is whatever was left over, and a half-sentence
 * gets the same weight as a paragraph it has no business outvoting.
 */
const MIN_CHUNK_LETTERS = 60;

/**
 * Below this the detector declines and the document stays untagged.
 *
 * Set where a two-window sample that disagrees with itself (0.5 agreement)
 * does not get to tag a document, but a longread where one window in six is a
 * quotation still does.
 */
export const MIN_CONFIDENCE = 0.6;

/**
 * Confidence floor applied to a sample sitting right on
 * {@link MIN_SAMPLE_LENGTH}, ramping to 1 at {@link FULL_CONFIDENCE_LENGTH}.
 *
 * Agreement alone would score a one-window sample 1.0 — perfect confidence out
 * of a single opinion. Scaling by length keeps a barely-eligible paragraph
 * honest about how little it saw, while still letting it tag: a short post in
 * plain Spanish is not a mystery.
 */
const SHORT_SAMPLE_FACTOR = 0.7;

/** The length at which a sample stops being penalized for being short. */
const FULL_CONFIDENCE_LENGTH = 1200;

export interface LanguageDetection {
  /** BCP-47 primary subtag from the closed vocabulary. */
  code: ContentLanguageCode;
  /** 0–1. How much of the document agreed, scaled by how much there was. */
  confidence: number;
}

/**
 * How much to trust a verdict drawn from this much text. Ramps linearly from
 * {@link SHORT_SAMPLE_FACTOR} to 1 across the eligible length range.
 */
function lengthFactor(length: number): number {
  const span = FULL_CONFIDENCE_LENGTH - MIN_SAMPLE_LENGTH;
  const progress = Math.min(
    1,
    Math.max(0, (length - MIN_SAMPLE_LENGTH) / span),
  );
  return SHORT_SAMPLE_FACTOR + (1 - SHORT_SAMPLE_FACTOR) * progress;
}

/**
 * Share of a sample's CJK writing that must be kana or Hangul before it decides
 * the language. Japanese prose runs well over half kana and Korean is almost
 * entirely Hangul, so 2% is far below anything real while still ignoring a
 * borrowed word or a quoted name in an otherwise Chinese document.
 */
const CJK_SCRIPT_SHARE = 0.02;

/**
 * …or this many characters outright, whichever comes first.
 *
 * Kanji-dense Japanese — an agenda, a spec, a page of compound nouns — can sit
 * under the share while still being unmistakably Japanese, because its
 * particles and verb endings have nowhere else to go. Eight is more kana than a
 * Chinese document picks up from quoting a name or two, and fewer than any real
 * stretch of Japanese manages to avoid.
 */
const CJK_SCRIPT_FLOOR = 8;

/**
 * Share of a sample's letters that must be CJK before this gate applies at all
 * — otherwise an English article quoting one Chinese place name would be tagged
 * Chinese.
 */
const CJK_DOMINANCE = 0.5;

/**
 * Settle Chinese, Japanese, and Korean from script, without consulting franc.
 *
 * Kana and Hangul appear in no other language, so their presence is decisive
 * and their absence is equally so: Han with no kana and no Hangul is Chinese.
 * Shares are measured against the sample's CJK writing rather than its whole
 * length, so a Japanese post with an English title is still Japanese.
 */
function cjkLanguageFromScript(
  sample: string,
  letters: number,
): ContentLanguageCode | null {
  const kana = sample.match(KANA)?.length ?? 0;
  const hangul = sample.match(HANGUL)?.length ?? 0;
  const han = sample.match(HAN)?.length ?? 0;

  const cjk = kana + hangul + han;
  if (cjk === 0 || letters === 0) return null;
  if (cjk / letters < CJK_DOMINANCE) return null;
  if (hangul / cjk >= CJK_SCRIPT_SHARE || hangul >= CJK_SCRIPT_FLOOR) {
    return "ko";
  }
  if (kana / cjk >= CJK_SCRIPT_SHARE || kana >= CJK_SCRIPT_FLOOR) return "ja";
  return "zh";
}

/** Split a sample into at most {@link MAX_CHUNKS} windows, on word boundaries. */
function chunks(sample: string): Array<string> {
  if (sample.length <= CHUNK_LENGTH) return [sample];

  const out: Array<string> = [];
  let cursor = 0;
  while (cursor < sample.length && out.length < MAX_CHUNKS) {
    let end = Math.min(cursor + CHUNK_LENGTH, sample.length);
    if (end < sample.length) {
      // Prefer a word boundary so a window never starts mid-token, which would
      // hand the trigram model trigrams that exist in no language.
      const space = sample.lastIndexOf(" ", end);
      if (space > cursor + CHUNK_LENGTH / 2) end = space;
    }
    const piece = sample.slice(cursor, end).trim();
    if (piece !== "" && proseLength(piece) >= MIN_CHUNK_LETTERS)
      out.push(piece);
    cursor = end;
  }
  return out.length > 0 ? out : [sample.slice(0, CHUNK_LENGTH)];
}

/**
 * Name the language of an arbitrary piece of text, or return `null`.
 *
 * `null` means "no answer" — it does not distinguish "too short to tell" from
 * "a language this app does not list", because the two are indistinguishable to
 * a reader and both must leave the document unfiltered.
 */
export function detectLanguage(text: string): LanguageDetection | null {
  const sample = text.trim();
  const length = proseLength(sample);
  if (length < MIN_SAMPLE_LENGTH) return null;

  const fromScript = cjkLanguageFromScript(sample, letterCount(sample));
  if (fromScript) {
    // Script evidence is categorical, not statistical — there is no runner-up
    // for it to be close to — so it is not diluted by the length scale.
    return { code: fromScript, confidence: 1 };
  }

  const votes = new Map<ContentLanguageCode, number>();
  let counted = 0;
  for (const chunk of chunks(sample)) {
    const top = francAll(chunk, { only: ONLY })[0];
    if (!top || top[0] === "und") continue;
    const code = contentLanguageFromIso639_3(top[0]);
    if (!code) continue;
    votes.set(code, (votes.get(code) ?? 0) + 1);
    counted += 1;
  }
  if (counted === 0) return null;

  let winner: ContentLanguageCode | null = null;
  let best = 0;
  for (const [code, count] of votes) {
    if (count > best) {
      best = count;
      winner = code;
    }
  }
  if (!winner) return null;

  const confidence = (best / counted) * lengthFactor(length);
  if (confidence < MIN_CONFIDENCE) return null;

  return { code: winner, confidence: Number(confidence.toFixed(3)) };
}

/**
 * Tag a document from its indexed text — the entry point ingest and the
 * backfill sweep both call.
 */
export function detectDocumentLanguage(
  parts: DocumentTextParts,
): LanguageDetection | null {
  return detectLanguage(documentLanguageSample(parts));
}
