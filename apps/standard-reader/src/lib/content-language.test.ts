import { describe, expect, it } from "vitest";

import {
  CONTENT_LANGUAGES,
  contentLanguageFromDetectorLabel,
  contentLanguageLabel,
  feedLanguagesToDbValue,
  parseFeedLanguages,
} from "./content-language.ts";

describe("the catalog", () => {
  it("has no duplicate codes", () => {
    const codes = CONTENT_LANGUAGES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no duplicate detector labels", () => {
    // Two entries claiming the same GlotLID label would make the detector's
    // output ambiguous — whichever entry the map built last would silently win.
    const labels = CONTENT_LANGUAGES.flatMap((entry) => entry.detected);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every language an endonym and an English name", () => {
    for (const entry of CONTENT_LANGUAGES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.englishLabel.length).toBeGreaterThan(0);
      expect(entry.detected.length).toBeGreaterThan(0);
    }
  });

  it("maps every detector label back to a language in the catalog", () => {
    for (const entry of CONTENT_LANGUAGES) {
      for (const label of entry.detected) {
        expect(contentLanguageFromDetectorLabel(label)).toBe(entry.code);
        expect(label).toMatch(/^[a-z]{3}_[A-Z][a-z]{3}$/);
      }
    }
  });

  it("does not claim a language it has no detector label for", () => {
    expect(contentLanguageFromDetectorLabel("tat_Cyrl")).toBeNull();
    // Romanized writing is deliberately not the language it romanizes.
    expect(contentLanguageFromDetectorLabel("hin_Latn")).toBeNull();
  });

  it("folds a language's detector variants onto one code", () => {
    // Norwegian Bokmål and Nynorsk are one language to a reader picking a
    // filter, as are Mandarin and Cantonese, even though the model splits them.
    expect(contentLanguageFromDetectorLabel("nob_Latn")).toBe("no");
    expect(contentLanguageFromDetectorLabel("nno_Latn")).toBe("no");
    expect(contentLanguageFromDetectorLabel("cmn_Hani")).toBe("zh");
    expect(contentLanguageFromDetectorLabel("yue_Hani")).toBe("zh");
  });
});

describe("parseFeedLanguages", () => {
  it("treats null, empty, and whitespace as no filter", () => {
    expect(parseFeedLanguages(null)).toEqual([]);
    expect(parseFeedLanguages()).toEqual([]);
    expect(parseFeedLanguages("")).toEqual([]);
    expect(parseFeedLanguages("   ")).toEqual([]);
  });

  it("reads a stored list", () => {
    expect(parseFeedLanguages("en,ja")).toEqual(["en", "ja"]);
  });

  it("canonicalizes into catalog order, whatever order they were clicked", () => {
    expect(parseFeedLanguages("ja,en")).toEqual(parseFeedLanguages("en,ja"));
  });

  it("tolerates whitespace, case, and duplicates", () => {
    expect(parseFeedLanguages(" EN , en,  ja ")).toEqual(["en", "ja"]);
  });

  it("drops codes outside the vocabulary instead of keeping dead weight", () => {
    // A code nothing is tagged with would filter every document away with no
    // way for the reader to see why.
    expect(parseFeedLanguages("en,klingon,zz")).toEqual(["en"]);
  });
});

describe("feedLanguagesToDbValue", () => {
  it("stores null for an empty selection, not an empty string", () => {
    // "Never chose" and "chose nothing" must be the same row state — both mean
    // no filter, so clearing every language gives the reader their feed back.
    expect(feedLanguagesToDbValue([])).toBeNull();
    expect(feedLanguagesToDbValue(["not-a-language"])).toBeNull();
  });

  it("round-trips through the parser", () => {
    const stored = feedLanguagesToDbValue(["ja", "en", "pt"]);
    expect(parseFeedLanguages(stored)).toEqual(["en", "pt", "ja"]);
  });
});

describe("contentLanguageLabel", () => {
  it("renders a language in its own script", () => {
    expect(contentLanguageLabel("ja")).toBe("日本語");
    expect(contentLanguageLabel("de")).toBe("Deutsch");
  });

  it("falls back to the code rather than rendering nothing", () => {
    expect(contentLanguageLabel("zz")).toBe("zz");
  });
});
