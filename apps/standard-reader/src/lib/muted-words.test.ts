import { describe, expect, it } from "vitest";

import {
  cardMatchesMutedWords,
  compileMutedWordMatcher,
  MAX_MUTED_WORD_LENGTH,
  mutedWordPostgresPattern,
  normalizeMutedWord,
  textMatchesMutedWords,
} from "./muted-words";

function matches(words: Array<string>, text: string): boolean {
  return textMatchesMutedWords(compileMutedWordMatcher(words), text);
}

describe("normalizeMutedWord", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMutedWord("  White   House ")).toBe("white house");
    expect(normalizeMutedWord("POLITICS")).toBe("politics");
  });

  it("strips control characters, including the SQL field separator", () => {
    expect(normalizeMutedWord("white\u001F house")).toBe("white house");
    expect(normalizeMutedWord("vo\u0000te")).toBe("vote");
  });

  it("applies NFKC so compatibility forms collapse to one entry", () => {
    // Fullwidth Latin → ASCII.
    expect(normalizeMutedWord("ＰＯＬＩＴＩＣＳ")).toBe("politics");
  });

  it("keeps one trailing wildcard", () => {
    expect(normalizeMutedWord("elect*")).toBe("elect*");
    expect(normalizeMutedWord("elect***")).toBe("elect*");
    expect(normalizeMutedWord("elect *")).toBe("elect*");
  });

  it("rejects anything with nothing to match on", () => {
    expect(normalizeMutedWord("")).toBeNull();
    expect(normalizeMutedWord("   ")).toBeNull();
    expect(normalizeMutedWord("*")).toBeNull();
    expect(normalizeMutedWord("!!!")).toBeNull();
    expect(
      normalizeMutedWord("a".repeat(MAX_MUTED_WORD_LENGTH + 1)),
    ).toBeNull();
  });
});

describe("compileMutedWordMatcher", () => {
  it("is null for an empty list, which never matches", () => {
    expect(compileMutedWordMatcher([])).toBeNull();
    expect(textMatchesMutedWords(null, "politics")).toBe(false);
  });

  it("matches whole words case-insensitively", () => {
    expect(matches(["president"], "Ranking every President")).toBe(true);
    expect(matches(["president"], "president: a history")).toBe(true);
    expect(matches(["president"], "The (president)")).toBe(true);
  });

  it("does not match inside a longer word", () => {
    expect(matches(["president"], "Presidential libraries")).toBe(false);
    expect(matches(["president"], "Vicepresident")).toBe(false);
    expect(matches(["art"], "Smart contracts")).toBe(false);
  });

  it("matches a phrase across any whitespace, but not a fragment of it", () => {
    expect(matches(["white house"], "Inside the White  House")).toBe(true);
    expect(matches(["white house"], "white\nhouse")).toBe(true);
    expect(matches(["white house"], "A white houseboat")).toBe(false);
    expect(matches(["white house"], "White paint")).toBe(false);
  });

  it("treats a trailing * as a prefix match", () => {
    expect(matches(["elect*"], "Elections are coming")).toBe(true);
    expect(matches(["elect*"], "The electoral map")).toBe(true);
    expect(matches(["elect*"], "Selected works")).toBe(false);
  });

  it("matches any word in the list", () => {
    const words = ["politics", "elections", "president"];
    expect(matches(words, "Weekend elections")).toBe(true);
    expect(matches(words, "Gardening notes")).toBe(false);
  });

  it("treats regex metacharacters literally", () => {
    expect(matches(["c++"], "Modern C++ tips")).toBe(true);
    expect(matches(["c++"], "Modern C tips")).toBe(false);
    expect(matches(["a.b"], "aXb")).toBe(false);
    expect(matches(["#politics"], "Tagged #politics")).toBe(true);
  });

  it("matches non-Latin words on their own word boundaries", () => {
    expect(matches(["política"], "La política hoy")).toBe(true);
    expect(matches(["política"], "Políticas públicas")).toBe(false);
    expect(matches(["выборы"], "Выборы 2026")).toBe(true);
  });

  it("falls back to substring matching for unspaced scripts", () => {
    expect(matches(["選挙"], "今日の選挙速報")).toBe(true);
    expect(matches(["정치"], "정치는 어렵다")).toBe(true);
  });
});

describe("cardMatchesMutedWords", () => {
  const matcher = compileMutedWordMatcher(["politics"]);

  it("checks an article's title and description", () => {
    expect(cardMatchesMutedWords({ title: "Politics today" }, matcher)).toBe(
      true,
    );
    expect(
      cardMatchesMutedWords(
        { title: "Weekly notes", description: "Mostly politics" },
        matcher,
      ),
    ).toBe(true);
  });

  it("checks a publication's name and description", () => {
    expect(cardMatchesMutedWords({ name: "Politics Weekly" }, matcher)).toBe(
      true,
    );
  });

  it("leaves unrelated cards alone", () => {
    expect(
      cardMatchesMutedWords(
        { title: "Gardening", description: null, name: null },
        matcher,
      ),
    ).toBe(false);
  });
});

describe("mutedWordPostgresPattern", () => {
  it("wraps whole words in ARE word boundaries", () => {
    expect(mutedWordPostgresPattern("president")).toBe(
      String.raw`\mpresident\M`,
    );
  });

  it(String.raw`joins phrase tokens with \s+`, () => {
    expect(mutedWordPostgresPattern("white house")).toBe(
      String.raw`\mwhite\s+house\M`,
    );
  });

  it("drops the end boundary for a prefix match", () => {
    expect(mutedWordPostgresPattern("elect*")).toBe(String.raw`\melect`);
  });

  it("escapes metacharacters and skips boundaries next to punctuation", () => {
    expect(mutedWordPostgresPattern("c++")).toBe(String.raw`\mc\+\+`);
    expect(mutedWordPostgresPattern("#politics")).toBe(String.raw`#politics\M`);
  });

  it("skips boundaries for unspaced scripts", () => {
    expect(mutedWordPostgresPattern("選挙")).toBe("選挙");
  });
});
