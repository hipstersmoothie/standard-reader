import { describe, expect, it } from "vitest";

import { detectDocumentLanguage, detectLanguage } from "./detect.ts";
import { documentLanguageSample, proseSample } from "./sample.ts";

/** Long enough to clear `MIN_SAMPLE_LENGTH` without being a whole article. */
const SAMPLES: Record<string, string> = {
  en: "The committee met on a grey Tuesday morning to decide whether the old library building should be sold, and after three hours of argument nobody had changed their mind about anything at all.",
  es: "El comité se reunió una mañana gris de martes para decidir si el viejo edificio de la biblioteca debía venderse, y después de tres horas de discusión nadie había cambiado de opinión sobre nada.",
  fr: "Le comité s'est réuni un mardi matin gris pour décider si l'ancien bâtiment de la bibliothèque devait être vendu, et après trois heures de discussion personne n'avait changé d'avis sur quoi que ce soit.",
  de: "Der Ausschuss traf sich an einem grauen Dienstagmorgen, um zu entscheiden, ob das alte Bibliotheksgebäude verkauft werden sollte, und nach drei Stunden Streit hatte niemand seine Meinung geändert.",
  pt: "O comitê reuniu-se numa manhã cinzenta de terça-feira para decidir se o antigo edifício da biblioteca deveria ser vendido, e depois de três horas de discussão ninguém tinha mudado de ideia sobre nada.",
  nl: "De commissie kwam op een grauwe dinsdagochtend bijeen om te beslissen of het oude bibliotheekgebouw verkocht moest worden, en na drie uur discussiëren was niemand van gedachten veranderd.",
  it: "Il comitato si è riunito in una grigia mattina di martedì per decidere se il vecchio edificio della biblioteca dovesse essere venduto, e dopo tre ore di discussione nessuno aveva cambiato idea.",
  pl: "Komisja zebrała się w szary wtorkowy poranek, aby zdecydować, czy stary budynek biblioteki powinien zostać sprzedany, a po trzech godzinach kłótni nikt nie zmienił zdania na żaden temat.",
  ru: "Комитет собрался серым утром вторника, чтобы решить, следует ли продавать старое здание библиотеки, и после трёх часов споров никто так и не изменил своего мнения ни по одному вопросу.",
  uk: "Комітет зібрався сірого вівторкового ранку, щоб вирішити, чи слід продавати стару будівлю бібліотеки, і після трьох годин суперечок ніхто так і не змінив своєї думки з жодного питання.",
  ja: "委員会は灰色の火曜日の朝に集まり、古い図書館の建物を売却すべきかどうかを決めることになりました。三時間も議論を続けましたが、結局だれも考えを変えることはありませんでした。",
  zh: "委员会在一个灰色的星期二早晨开会，讨论是否应该出售那座旧图书馆的建筑。经过三个小时的争论之后，没有一个人改变了自己原来的看法，会议就这样结束了。",
  ko: "위원회는 회색빛 화요일 아침에 모여 오래된 도서관 건물을 매각해야 하는지를 결정하려 했습니다. 세 시간 동안 논쟁을 벌였지만 결국 아무도 자신의 생각을 바꾸지 않았습니다.",
  ar: "اجتمعت اللجنة في صباح يوم ثلاثاء رمادي لتقرر ما إذا كان ينبغي بيع مبنى المكتبة القديم، وبعد ثلاث ساعات من النقاش لم يغير أحد رأيه في أي شيء على الإطلاق في نهاية الأمر.",
  el: "Η επιτροπή συνεδρίασε ένα γκρίζο πρωινό της Τρίτης για να αποφασίσει αν το παλιό κτίριο της βιβλιοθήκης πρέπει να πουληθεί, και μετά από τρεις ώρες συζήτησης κανείς δεν είχε αλλάξει γνώμη.",
  tr: "Komite, eski kütüphane binasının satılıp satılmaması gerektiğine karar vermek için gri bir salı sabahı toplandı ve üç saatlik tartışmanın ardından hiç kimse herhangi bir konuda fikrini değiştirmedi.",
  sv: "Kommittén sammanträdde en grå tisdagsmorgon för att avgöra om den gamla biblioteksbyggnaden skulle säljas, och efter tre timmars diskussion hade ingen ändrat uppfattning om någonting alls.",
};

describe("detectLanguage", () => {
  for (const [code, text] of Object.entries(SAMPLES)) {
    it(`places a ${code} paragraph`, () => {
      expect(detectLanguage(text)?.code).toBe(code);
    });
  }

  it("declines rather than guessing on too little text", () => {
    expect(detectLanguage("Hello there.")).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });

  it("does not count digits and punctuation as prose", () => {
    // Long enough as a string, but nothing in it is written in a language.
    expect(
      detectLanguage("12:30 — 2024-01-02 · 45% · $1,200 · #4 ".repeat(8)),
    ).toBeNull();
  });

  it("reads a kanji-heavy Japanese document as Japanese, not Chinese", () => {
    // The case the CJK pre-gate exists for: far more kanji than kana, which is
    // where franc's Han-inclusive `jpn` pattern and a naive share test both go
    // wrong. The particles and verb endings are all the evidence there is.
    const kanjiHeavy =
      "第一四半期経営戦略会議資料の概要を報告する。地域別市場占有率は前年同期比で増加し、新規事業開発投資計画の検討事項も併せて提示した。人材採用教育研修制度改定案および情報技術基盤整備予算執行状況については次回審議とする。";
    expect(detectLanguage(kanjiHeavy)?.code).toBe("ja");
  });

  it("is not flipped to Japanese by one borrowed word in a Chinese document", () => {
    const chineseWithLoanword = `${SAMPLES.zh}${SAMPLES.zh}カ`;
    expect(detectLanguage(chineseWithLoanword)?.code).toBe("zh");
  });

  it("scores a short sample below a long one in the same language", () => {
    const short = detectLanguage(SAMPLES.en);
    const long = detectLanguage(SAMPLES.en.repeat(8));
    expect(short?.confidence).toBeLessThan(long?.confidence ?? 0);
    expect(long?.confidence).toBe(1);
  });

  it("tags a CJK paragraph without demanding five times the writing", () => {
    // 70-odd Han characters is a full paragraph of Chinese. Counting them
    // one-for-one against MIN_SAMPLE_LENGTH would refuse it; proseLength
    // weights dense scripts so it does not.
    expect(SAMPLES.zh.length).toBeLessThan(120);
    expect(detectLanguage(SAMPLES.zh)?.code).toBe("zh");
  });

  it("tolerates a quotation in another language", () => {
    const mostlyEnglish = `${SAMPLES.en.repeat(6)} ${SAMPLES.de}`;
    expect(detectLanguage(mostlyEnglish)?.code).toBe("en");
  });

  it("scores a mixed document below a monolingual one", () => {
    // A half-and-half document still gets *a* tag — either answer is defensible
    // and `null` would only mean "no filter applies", which is not more correct.
    // What has to hold is that the confidence says it was a closer call, so the
    // number stays usable as a quality signal for a later sweep.
    const mixed = detectLanguage(
      `${SAMPLES.en.repeat(3)} ${SAMPLES.de.repeat(3)}`,
    );
    const pure = detectLanguage(SAMPLES.en.repeat(6));
    expect(mixed).not.toBeNull();
    expect(mixed?.confidence).toBeLessThan(pure?.confidence ?? 0);
  });

  it("only ever returns a code from the closed vocabulary", () => {
    // Scots and Interlingua are in the raw trigram data and are what an
    // unrestricted detector reports for plain English prose.
    const result = detectLanguage(SAMPLES.en.repeat(4));
    expect(result?.code).toBe("en");
  });
});

describe("proseSample", () => {
  it("drops code fences, URLs, tags, and handles", () => {
    const cleaned = proseSample(
      "Read this ```const x = 1;``` at https://example.com/a/b via @someone.bsky.social <em>now</em>.",
    );
    expect(cleaned).not.toContain("const");
    expect(cleaned).not.toContain("example.com");
    expect(cleaned).not.toContain("@someone");
    expect(cleaned).not.toContain("<em>");
    expect(cleaned).toContain("Read this");
  });

  it("keeps a markdown link's text and drops its target", () => {
    expect(
      proseSample("See [the report](https://example.com/report.pdf)."),
    ).toBe("See the report.");
  });

  it("stops a code-heavy English post from reading as untagged noise", () => {
    const post = `# Migrating the ingest worker

We moved the consumer off the old socket wrapper this week, because it kept
dropping the connection whenever the archive replay overran an hour. The new
one reconnects on its own and the cursor survives a restart, which is the part
that actually mattered to us.

\`\`\`ts
const channel = new JetstreamChannel({ collections, cursor })
for await (const event of channel) { await handle(event) }
\`\`\`

See https://github.com/example/repo/pull/1234 for the diff. Nothing else in the
worker changed, and the read model is untouched.`;
    expect(detectLanguage(proseSample(post))?.code).toBe("en");
  });
});

describe("detectDocumentLanguage", () => {
  it("reads title, description, and body together", () => {
    expect(
      detectDocumentLanguage({
        title: "El comité y la biblioteca",
        description: "Una reunión larga",
        textContent: SAMPLES.es,
      })?.code,
    ).toBe("es");
  });

  it("declines on a document with nothing indexed but a title", () => {
    expect(
      detectDocumentLanguage({
        title: "Hello",
        description: null,
        textContent: null,
      }),
    ).toBeNull();
  });

  it("survives every field being null", () => {
    expect(
      detectDocumentLanguage({
        title: null,
        description: null,
        textContent: null,
      }),
    ).toBeNull();
  });
});

describe("documentLanguageSample", () => {
  it("leads with the title, which is the most reliably monolingual part", () => {
    const sample = documentLanguageSample({
      title: "A title",
      description: "A description",
      textContent: "A body",
    });
    expect(sample).toBe("A title A description A body");
  });
});
