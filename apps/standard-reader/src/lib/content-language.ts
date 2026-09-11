/**
 * Content languages — the language a *document* is written in, and the reader
 * preference that filters feeds down to a chosen set of them.
 *
 * Deliberately separate from `#/lib/locale`, which is the language the
 * **interface** is translated into. The app ships ten UI locales; the network
 * publishes in far more than ten languages, and a reader who wants the app in
 * English may well want to read Japanese. The two vocabularies do not
 * constrain each other, and neither seeds the other.
 *
 * `site.standard.document` has no language field — nothing in the lexicon
 * records one — so the code is derived by the detector in `#/server/lang` and
 * stored on `documents.lang`. That makes this list a **closed vocabulary**: the
 * detector only ever emits a code from {@link CONTENT_LANGUAGES}, so every
 * value the column can hold has a row in the settings picker, and a reader can
 * never be shown a filter chip for a language nothing is tagged with.
 *
 * A document the detector could not place keeps `lang = null`, and **null is
 * never filtered out** — see `#/server/reader/language-filters`. A language
 * filter narrows what you see by positive evidence only; it never hides a
 * document on the strength of a guess the detector declined to make.
 */

/** BCP-47 primary subtag (ISO 639-1 where one exists). */
export type ContentLanguageCode = (typeof CONTENT_LANGUAGES)[number]["code"];

export interface ContentLanguage {
  /** BCP-47 primary subtag — what `documents.lang` stores. */
  code: string;
  /**
   * The ISO 639-3 code(s) the trigram detector reports for this language.
   *
   * More than one where the detector splits a language finer than readers
   * think of it: Norwegian Bokmål and Nynorsk are one entry here, as are the
   * Latin and Cyrillic models for Serbian.
   */
  detected: ReadonlyArray<string>;
  /** Endonym — the language's name in itself, as the picker shows it. */
  label: string;
  /** English name, for search/matching in the picker. */
  englishLabel: string;
}

/**
 * The languages a document can be tagged with, in the order the picker lists
 * them: roughly by how much of the network writes in them, then alphabetically.
 *
 * Growing this list is cheap and safe — add the entry, and the next detection
 * sweep starts tagging documents with it. Removing one is not: rows already
 * carrying the code would stop matching any filter, so retire an entry by
 * clearing `documents.lang` for it in the same change.
 */
export const CONTENT_LANGUAGES = [
  { code: "en", detected: ["eng"], label: "English", englishLabel: "English" },
  { code: "es", detected: ["spa"], label: "Español", englishLabel: "Spanish" },
  {
    code: "pt",
    detected: ["por"],
    label: "Português",
    englishLabel: "Portuguese",
  },
  { code: "fr", detected: ["fra"], label: "Français", englishLabel: "French" },
  { code: "de", detected: ["deu"], label: "Deutsch", englishLabel: "German" },
  { code: "it", detected: ["ita"], label: "Italiano", englishLabel: "Italian" },
  { code: "nl", detected: ["nld"], label: "Nederlands", englishLabel: "Dutch" },
  { code: "ja", detected: ["jpn"], label: "日本語", englishLabel: "Japanese" },
  { code: "zh", detected: ["cmn"], label: "中文", englishLabel: "Chinese" },
  { code: "ko", detected: ["kor"], label: "한국어", englishLabel: "Korean" },
  { code: "ru", detected: ["rus"], label: "Русский", englishLabel: "Russian" },
  {
    code: "uk",
    detected: ["ukr"],
    label: "Українська",
    englishLabel: "Ukrainian",
  },
  { code: "pl", detected: ["pol"], label: "Polski", englishLabel: "Polish" },
  { code: "tr", detected: ["tur"], label: "Türkçe", englishLabel: "Turkish" },
  { code: "ar", detected: ["arb"], label: "العربية", englishLabel: "Arabic" },
  { code: "fa", detected: ["pes"], label: "فارسی", englishLabel: "Persian" },
  { code: "he", detected: ["heb"], label: "עברית", englishLabel: "Hebrew" },
  { code: "hi", detected: ["hin"], label: "हिन्दी", englishLabel: "Hindi" },
  { code: "bn", detected: ["ben"], label: "বাংলা", englishLabel: "Bengali" },
  {
    code: "id",
    detected: ["ind"],
    label: "Bahasa Indonesia",
    englishLabel: "Indonesian",
  },
  {
    code: "vi",
    detected: ["vie"],
    label: "Tiếng Việt",
    englishLabel: "Vietnamese",
  },
  { code: "th", detected: ["tha"], label: "ไทย", englishLabel: "Thai" },
  { code: "sv", detected: ["swe"], label: "Svenska", englishLabel: "Swedish" },
  { code: "da", detected: ["dan"], label: "Dansk", englishLabel: "Danish" },
  {
    code: "no",
    detected: ["nob", "nno"],
    label: "Norsk",
    englishLabel: "Norwegian",
  },
  { code: "fi", detected: ["fin"], label: "Suomi", englishLabel: "Finnish" },
  { code: "cs", detected: ["ces"], label: "Čeština", englishLabel: "Czech" },
  {
    code: "sk",
    detected: ["slk"],
    label: "Slovenčina",
    englishLabel: "Slovak",
  },
  { code: "hu", detected: ["hun"], label: "Magyar", englishLabel: "Hungarian" },
  { code: "ro", detected: ["ron"], label: "Română", englishLabel: "Romanian" },
  { code: "el", detected: ["ell"], label: "Ελληνικά", englishLabel: "Greek" },
  {
    code: "bg",
    detected: ["bul"],
    label: "Български",
    englishLabel: "Bulgarian",
  },
  { code: "sr", detected: ["srp"], label: "Српски", englishLabel: "Serbian" },
  {
    code: "hr",
    detected: ["hrv"],
    label: "Hrvatski",
    englishLabel: "Croatian",
  },
  {
    code: "sl",
    detected: ["slv"],
    label: "Slovenščina",
    englishLabel: "Slovenian",
  },
  {
    code: "lt",
    detected: ["lit"],
    label: "Lietuvių",
    englishLabel: "Lithuanian",
  },
  { code: "lv", detected: ["lvs"], label: "Latviešu", englishLabel: "Latvian" },
  { code: "et", detected: ["ekk"], label: "Eesti", englishLabel: "Estonian" },
  { code: "ca", detected: ["cat"], label: "Català", englishLabel: "Catalan" },
  { code: "gl", detected: ["glg"], label: "Galego", englishLabel: "Galician" },
  {
    code: "ms",
    detected: ["zlm"],
    label: "Bahasa Melayu",
    englishLabel: "Malay",
  },
  { code: "tl", detected: ["tgl"], label: "Tagalog", englishLabel: "Tagalog" },
  {
    code: "sw",
    detected: ["swh"],
    label: "Kiswahili",
    englishLabel: "Swahili",
  },
  {
    code: "af",
    detected: ["afr"],
    label: "Afrikaans",
    englishLabel: "Afrikaans",
  },
  {
    code: "be",
    detected: ["bel"],
    label: "Беларуская",
    englishLabel: "Belarusian",
  },
  {
    code: "mk",
    detected: ["mkd"],
    label: "Македонски",
    englishLabel: "Macedonian",
  },
  { code: "kk", detected: ["kaz"], label: "Қазақша", englishLabel: "Kazakh" },
  { code: "hy", detected: ["hye"], label: "Հայերեն", englishLabel: "Armenian" },
  { code: "ka", detected: ["kat"], label: "ქართული", englishLabel: "Georgian" },
  { code: "ta", detected: ["tam"], label: "தமிழ்", englishLabel: "Tamil" },
  { code: "te", detected: ["tel"], label: "తెలుగు", englishLabel: "Telugu" },
  { code: "ml", detected: ["mal"], label: "മലയാളം", englishLabel: "Malayalam" },
  { code: "kn", detected: ["kan"], label: "ಕನ್ನಡ", englishLabel: "Kannada" },
  { code: "gu", detected: ["guj"], label: "ગુજરાતી", englishLabel: "Gujarati" },
  { code: "pa", detected: ["pan"], label: "ਪੰਜਾਬੀ", englishLabel: "Punjabi" },
  { code: "mr", detected: ["mar"], label: "मराठी", englishLabel: "Marathi" },
  { code: "ne", detected: ["npi"], label: "नेपाली", englishLabel: "Nepali" },
  { code: "ur", detected: ["urd"], label: "اردو", englishLabel: "Urdu" },
  { code: "si", detected: ["sin"], label: "සිංහල", englishLabel: "Sinhala" },
  { code: "km", detected: ["khm"], label: "ខ្មែរ", englishLabel: "Khmer" },
  { code: "lo", detected: ["lao"], label: "ລາວ", englishLabel: "Lao" },
  { code: "my", detected: ["mya"], label: "မြန်မာ", englishLabel: "Burmese" },
  { code: "am", detected: ["amh"], label: "አማርኛ", englishLabel: "Amharic" },
  { code: "sq", detected: ["als"], label: "Shqip", englishLabel: "Albanian" },
  {
    code: "eo",
    detected: ["epo"],
    label: "Esperanto",
    englishLabel: "Esperanto",
  },
] as const satisfies ReadonlyArray<ContentLanguage>;

const BY_CODE = new Map<string, ContentLanguage>(
  CONTENT_LANGUAGES.map((entry) => [entry.code, entry]),
);

/** ISO 639-3 -> BCP-47, for translating what the trigram detector reports. */
const BY_DETECTED = new Map<string, ContentLanguageCode>(
  CONTENT_LANGUAGES.flatMap((entry) =>
    entry.detected.map((iso) => [iso, entry.code as ContentLanguageCode]),
  ),
);

/** Every ISO 639-3 code the detector is allowed to return. */
export const DETECTABLE_ISO_639_3: ReadonlyArray<string> = [
  ...BY_DETECTED.keys(),
];

export function isContentLanguage(
  value: unknown,
): value is ContentLanguageCode {
  return typeof value === "string" && BY_CODE.has(value);
}

/** Map a detector result (ISO 639-3) onto this app's code, or `null`. */
export function contentLanguageFromIso639_3(
  iso: string,
): ContentLanguageCode | null {
  return BY_DETECTED.get(iso) ?? null;
}

export function contentLanguage(code: string): ContentLanguage | undefined {
  return BY_CODE.get(code);
}

/**
 * Endonym for a code. Falls back to the code itself so a row written by an
 * older, wider vocabulary still renders as something rather than nothing.
 */
export function contentLanguageLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}

/** No filter — the reader sees every language. See the module comment. */
export const DEFAULT_FEED_LANGUAGES: ReadonlyArray<ContentLanguageCode> = [];

/**
 * Decode `user.feed_languages`.
 *
 * Stored as a comma-separated list of codes; `null` and `""` both mean "no
 * filter", which is the default and what guests always get. Unknown codes are
 * dropped rather than kept as dead weight, and the result is canonicalized into
 * {@link CONTENT_LANGUAGES} order so the picker's selection is stable no matter
 * what order the reader clicked them in.
 */
export function parseFeedLanguages(
  value?: string | null,
): Array<ContentLanguageCode> {
  if (typeof value !== "string" || value.trim() === "") return [];
  const chosen = new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => isContentLanguage(part)),
  );
  return CONTENT_LANGUAGES.filter((entry) => chosen.has(entry.code)).map(
    (entry) => entry.code,
  );
}

/**
 * Encode for `user.feed_languages`. An empty selection stores `null`, not `""`,
 * so "never chose" and "chose nothing" are the same row state — both mean no
 * filter, and a reader who clears every language gets their whole feed back
 * rather than an empty one.
 */
export function feedLanguagesToDbValue(
  codes: ReadonlyArray<string>,
): string | null {
  const canonical = parseFeedLanguages(codes.join(","));
  return canonical.length === 0 ? null : canonical.join(",");
}
