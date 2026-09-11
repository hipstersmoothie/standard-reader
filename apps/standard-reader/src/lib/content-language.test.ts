import { describe, expect, it } from "vitest";

import {
  CONTENT_LANGUAGES,
  DETECTABLE_ISO_639_3,
  contentLanguageFromIso639_3,
  contentLanguageLabel,
  feedLanguagesToDbValue,
  isContentLanguage,
  parseFeedLanguages,
} from "./content-language.ts";

describe("the catalog", () => {
  it("has no duplicate codes", () => {
    const codes = CONTENT_LANGUAGES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no duplicate detector codes", () => {
    // Two entries claiming the same ISO 639-3 code would make the detector's
    // output ambiguous — whichever entry the map built last would silently win.
    expect(new Set(DETECTABLE_ISO_639_3).size).toBe(
      DETECTABLE_ISO_639_3.length,
    );
  });

  it("gives every language an endonym and an English name", () => {
    for (const entry of CONTENT_LANGUAGES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.englishLabel.length).toBeGreaterThan(0);
      expect(entry.detected.length).toBeGreaterThan(0);
    }
  });

  it("maps every detector code back to a language in the catalog", () => {
    for (const iso of DETECTABLE_ISO_639_3) {
      expect(isContentLanguage(contentLanguageFromIso639_3(iso))).toBe(true);
    }
  });

  it("does not claim a language it has no detector code for", () => {
    expect(contentLanguageFromIso639_3("xyz")).toBeNull();
  });

  it("folds a language's detector variants onto one code", () => {
    // Norwegian Bokmål and Nynorsk are one language to a reader picking a
    // filter, even though the trigram models are separate.
    expect(contentLanguageFromIso639_3("nob")).toBe("no");
    expect(contentLanguageFromIso639_3("nno")).toBe("no");
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
