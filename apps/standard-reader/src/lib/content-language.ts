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
   * The GlotLID label(s) — ISO 639-3 plus ISO 15924 script, e.g. `fas_Arab` —
   * that the detector in `#/server/lang` reports for this language.
   *
   * More than one where the model splits a language finer than readers think
   * of it: Norwegian Bokmål and Nynorsk are one entry, as are Serbian in both
   * scripts, the spoken Arabic varieties, and the Chinese ones (Mandarin,
   * Cantonese, Wu, Hakka, Classical) — a reader who picks "Chinese" means all
   * of them. Romanized writing (`hin_Latn`, `urd_Latn`, …) is deliberately
   * absent: a reader who reads Hindi reads Devanagari, so those stay untagged.
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
  {
    code: "en",
    detected: ["eng_Latn"],
    label: "English",
    englishLabel: "English",
  },
  {
    code: "es",
    detected: ["spa_Latn"],
    label: "Español",
    englishLabel: "Spanish",
  },
  {
    code: "pt",
    detected: ["por_Latn"],
    label: "Português",
    englishLabel: "Portuguese",
  },
  {
    code: "fr",
    detected: ["fra_Latn"],
    label: "Français",
    englishLabel: "French",
  },
  {
    code: "de",
    detected: ["deu_Latn"],
    label: "Deutsch",
    englishLabel: "German",
  },
  {
    code: "it",
    detected: ["ita_Latn"],
    label: "Italiano",
    englishLabel: "Italian",
  },
  {
    code: "nl",
    detected: ["nld_Latn"],
    label: "Nederlands",
    englishLabel: "Dutch",
  },
  {
    code: "ja",
    detected: ["jpn_Jpan"],
    label: "日本語",
    englishLabel: "Japanese",
  },
  {
    code: "zh",
    detected: ["cmn_Hani", "yue_Hani", "wuu_Hani", "hak_Hani", "lzh_Hani"],
    label: "中文",
    englishLabel: "Chinese",
  },
  {
    code: "ko",
    detected: ["kor_Hang"],
    label: "한국어",
    englishLabel: "Korean",
  },
  {
    code: "ru",
    detected: ["rus_Cyrl"],
    label: "Русский",
    englishLabel: "Russian",
  },
  {
    code: "uk",
    detected: ["ukr_Cyrl"],
    label: "Українська",
    englishLabel: "Ukrainian",
  },
  {
    code: "pl",
    detected: ["pol_Latn"],
    label: "Polski",
    englishLabel: "Polish",
  },
  {
    code: "tr",
    detected: ["tur_Latn"],
    label: "Türkçe",
    englishLabel: "Turkish",
  },
  {
    code: "ar",
    detected: [
      "arb_Arab",
      "ary_Arab",
      "arz_Arab",
      "apc_Arab",
      "ajp_Arab",
      "acm_Arab",
      "ars_Arab",
      "aeb_Arab",
      "ayp_Arab",
    ],
    label: "العربية",
    englishLabel: "Arabic",
  },
  {
    code: "fa",
    detected: ["fas_Arab"],
    label: "فارسی",
    englishLabel: "Persian",
  },
  {
    code: "he",
    detected: ["heb_Hebr"],
    label: "עברית",
    englishLabel: "Hebrew",
  },
  { code: "hi", detected: ["hin_Deva"], label: "हिन्दी", englishLabel: "Hindi" },
  { code: "bn", detected: ["ben_Beng"], label: "বাংলা", englishLabel: "Bengali" },
  {
    code: "id",
    detected: ["ind_Latn"],
    label: "Bahasa Indonesia",
    englishLabel: "Indonesian",
  },
  {
    code: "vi",
    detected: ["vie_Latn"],
    label: "Tiếng Việt",
    englishLabel: "Vietnamese",
  },
  { code: "th", detected: ["tha_Thai"], label: "ไทย", englishLabel: "Thai" },
  {
    code: "sv",
    detected: ["swe_Latn"],
    label: "Svenska",
    englishLabel: "Swedish",
  },
  {
    code: "da",
    detected: ["dan_Latn"],
    label: "Dansk",
    englishLabel: "Danish",
  },
  {
    code: "no",
    detected: ["nob_Latn", "nno_Latn"],
    label: "Norsk",
    englishLabel: "Norwegian",
  },
  {
    code: "fi",
    detected: ["fin_Latn"],
    label: "Suomi",
    englishLabel: "Finnish",
  },
  {
    code: "cs",
    detected: ["ces_Latn"],
    label: "Čeština",
    englishLabel: "Czech",
  },
  {
    code: "sk",
    detected: ["slk_Latn"],
    label: "Slovenčina",
    englishLabel: "Slovak",
  },
  {
    code: "hu",
    detected: ["hun_Latn"],
    label: "Magyar",
    englishLabel: "Hungarian",
  },
  {
    code: "ro",
    detected: ["ron_Latn"],
    label: "Română",
    englishLabel: "Romanian",
  },
  {
    code: "el",
    detected: ["ell_Grek"],
    label: "Ελληνικά",
    englishLabel: "Greek",
  },
  {
    code: "bg",
    detected: ["bul_Cyrl"],
    label: "Български",
    englishLabel: "Bulgarian",
  },
  {
    code: "sr",
    detected: ["srp_Cyrl", "srp_Latn"],
    label: "Српски",
    englishLabel: "Serbian",
  },
  {
    code: "hr",
    detected: ["hrv_Latn"],
    label: "Hrvatski",
    englishLabel: "Croatian",
  },
  {
    code: "sl",
    detected: ["slv_Latn"],
    label: "Slovenščina",
    englishLabel: "Slovenian",
  },
  {
    code: "lt",
    detected: ["lit_Latn"],
    label: "Lietuvių",
    englishLabel: "Lithuanian",
  },
  {
    code: "lv",
    detected: ["lvs_Latn"],
    label: "Latviešu",
    englishLabel: "Latvian",
  },
  {
    code: "et",
    detected: ["ekk_Latn"],
    label: "Eesti",
    englishLabel: "Estonian",
  },
  {
    code: "ca",
    detected: ["cat_Latn"],
    label: "Català",
    englishLabel: "Catalan",
  },
  {
    code: "gl",
    detected: ["glg_Latn"],
    label: "Galego",
    englishLabel: "Galician",
  },
  {
    code: "ms",
    detected: ["zsm_Latn"],
    label: "Bahasa Melayu",
    englishLabel: "Malay",
  },
  {
    code: "tl",
    detected: ["fil_Latn"],
    label: "Tagalog",
    englishLabel: "Tagalog",
  },
  {
    code: "sw",
    detected: ["swh_Latn", "swc_Latn"],
    label: "Kiswahili",
    englishLabel: "Swahili",
  },
  {
    code: "af",
    detected: ["afr_Latn"],
    label: "Afrikaans",
    englishLabel: "Afrikaans",
  },
  {
    code: "be",
    detected: ["bel_Cyrl"],
    label: "Беларуская",
    englishLabel: "Belarusian",
  },
  {
    code: "mk",
    detected: ["mkd_Cyrl"],
    label: "Македонски",
    englishLabel: "Macedonian",
  },
  {
    code: "kk",
    detected: ["kaz_Cyrl"],
    label: "Қазақша",
    englishLabel: "Kazakh",
  },
  {
    code: "hy",
    detected: ["hye_Armn"],
    label: "Հայերեն",
    englishLabel: "Armenian",
  },
  {
    code: "ka",
    detected: ["kat_Geor"],
    label: "ქართული",
    englishLabel: "Georgian",
  },
  { code: "ta", detected: ["tam_Taml"], label: "தமிழ்", englishLabel: "Tamil" },
  {
    code: "te",
    detected: ["tel_Telu"],
    label: "తెలుగు",
    englishLabel: "Telugu",
  },
  {
    code: "ml",
    detected: ["mal_Mlym"],
    label: "മലയാളം",
    englishLabel: "Malayalam",
  },
  {
    code: "kn",
    detected: ["kan_Knda"],
    label: "ಕನ್ನಡ",
    englishLabel: "Kannada",
  },
  {
    code: "gu",
    detected: ["guj_Gujr"],
    label: "ગુજરાતી",
    englishLabel: "Gujarati",
  },
  {
    code: "pa",
    detected: ["pan_Guru"],
    label: "ਪੰਜਾਬੀ",
    englishLabel: "Punjabi",
  },
  {
    code: "mr",
    detected: ["mar_Deva"],
    label: "मराठी",
    englishLabel: "Marathi",
  },
  {
    code: "ne",
    detected: ["npi_Deva"],
    label: "नेपाली",
    englishLabel: "Nepali",
  },
  { code: "ur", detected: ["urd_Arab"], label: "اردو", englishLabel: "Urdu" },
  {
    code: "si",
    detected: ["sin_Sinh"],
    label: "සිංහල",
    englishLabel: "Sinhala",
  },
  { code: "km", detected: ["khm_Khmr"], label: "ខ្មែរ", englishLabel: "Khmer" },
  { code: "lo", detected: ["lao_Laoo"], label: "ລາວ", englishLabel: "Lao" },
  {
    code: "my",
    detected: ["mya_Mymr"],
    label: "မြန်မာ",
    englishLabel: "Burmese",
  },
  {
    code: "am",
    detected: ["amh_Ethi"],
    label: "አማርኛ",
    englishLabel: "Amharic",
  },
  {
    code: "sq",
    detected: ["als_Latn", "aln_Latn"],
    label: "Shqip",
    englishLabel: "Albanian",
  },
  {
    code: "eo",
    detected: ["epo_Latn"],
    label: "Esperanto",
    englishLabel: "Esperanto",
  },
] as const satisfies ReadonlyArray<ContentLanguage>;

const BY_CODE = new Map<string, ContentLanguage>(
  CONTENT_LANGUAGES.map((entry) => [entry.code, entry]),
);

/** GlotLID label -> BCP-47, for translating what the detector reports. */
const BY_DETECTED = new Map<string, ContentLanguageCode>(
  CONTENT_LANGUAGES.flatMap((entry) =>
    entry.detected.map((iso) => [iso, entry.code as ContentLanguageCode]),
  ),
);

export function isContentLanguage(
  value: unknown,
): value is ContentLanguageCode {
  return typeof value === "string" && BY_CODE.has(value);
}

/**
 * Map a detector label (`fas_Arab`) onto this app's code, or `null` for a
 * language the closed vocabulary doesn't list.
 */
export function contentLanguageFromDetectorLabel(
  label: string,
): ContentLanguageCode | null {
  return BY_DETECTED.get(label) ?? null;
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
