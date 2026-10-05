import { beforeAll, describe, expect, it } from "vitest";

import { CONTENT_LANGUAGES } from "#/lib/content-language";

import {
  detectDocumentLanguage,
  detectLanguage,
  languageColumns,
} from "./detect.ts";
import { glotlidLabels, loadGlotlid } from "./glotlid.ts";
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

/** Too little prose to ask a model: no tag, and no model's name on it. */
const UNTAGGED = { code: null, confidence: null, source: null };

// ~150 ms, once. The model is a Git LFS object; a clone without LFS fetches it.
beforeAll(async () => {
  await loadGlotlid();
}, 60_000);

describe("detectLanguage", () => {
  for (const [code, text] of Object.entries(SAMPLES)) {
    it(`places a ${code} paragraph`, () => {
      expect(detectLanguage(text)).toMatchObject({ code, source: "glotlid" });
    });
  }

  it("declines rather than guessing on too little text", () => {
    expect(detectLanguage("Hello there.")).toEqual(UNTAGGED);
    expect(detectLanguage("")).toEqual(UNTAGGED);
  });

  it("does not count digits and punctuation as prose", () => {
    // Long enough as a string, but nothing in it is written in a language.
    expect(
      detectLanguage("12:30 — 2024-01-02 · 45% · $1,200 · #4 ".repeat(8)),
    ).toEqual(UNTAGGED);
  });

  it("leaves a language we don't list untagged instead of the nearest one", () => {
    // The failure that retired the trigram detector: forced to answer from the
    // vocabulary, it filed every Tatar post under Kazakh and every Pashto post
    // under Persian. GlotLID knows both, so they come back confident and
    // untagged — shown to every reader, hidden from none.
    const tatar =
      "Капка төбендә — җыр-моң: Туктар авылы халкы элекке кич утыру традицияләрен яңартты. Июльдә Туктар авылы клубы каршындагы болында матур кич утыру оештырылды, анда авыл халкы җырлады һәм биеде.";
    const pashto =
      "طالبانو د افغانستان پر اعلانېدو خواشیني وښوده. د طالبانو د باندنیو چارو وزارت د امریکا پر وروستۍ پرېکړه، چې افغانستان یې د ناحقه نیونو ملاتړی هېواد بللی، خواشینۍ څرګنده کړه.";
    for (const text of [tatar, pashto]) {
      expect(detectLanguage(text)).toMatchObject({
        code: null,
        source: "glotlid",
      });
    }
  });

  it("reads a kanji-heavy Japanese document as Japanese, not Chinese", () => {
    // Far more kanji than kana — the case trigram detection got wrong. The
    // particles and verb endings are all the evidence there is.
    const kanjiHeavy =
      "第一四半期経営戦略会議資料の概要を報告する。地域別市場占有率は前年同期比で増加し、新規事業開発投資計画の検討事項も併せて提示した。人材採用教育研修制度改定案および情報技術基盤整備予算執行状況については次回審議とする。";
    expect(detectLanguage(kanjiHeavy)?.code).toBe("ja");
  });

  it("is not flipped to Japanese by one borrowed word in a Chinese document", () => {
    const chineseWithLoanword = `${SAMPLES.zh}${SAMPLES.zh}カ`;
    expect(detectLanguage(chineseWithLoanword)?.code).toBe("zh");
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

  it("reports GlotLID's probability as the confidence", () => {
    const result = detectLanguage(SAMPLES.en.repeat(4));
    expect(result?.confidence).toBeGreaterThan(0.9);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });

  it("can reach every language in the vocabulary", () => {
    // A vocabulary label the model never emits is a language no document can
    // ever be tagged with — silently. Persian (`fas`, not `pes`), Filipino
    // (`fil`, not `tgl`) and Malay (`zsm`, not `zlm`) were exactly that when
    // the labels were carried over from the trigram detector.
    const labels = glotlidLabels();
    expect(labels.size).toBeGreaterThan(2000);
    for (const entry of CONTENT_LANGUAGES) {
      for (const label of entry.detected) {
        expect(labels.has(label), `${entry.code}: ${label}`).toBe(true);
      }
    }
  });

  it("only ever returns a code from the closed vocabulary", () => {
    const codes = new Set<string>(CONTENT_LANGUAGES.map((l) => l.code));
    for (const text of Object.values(SAMPLES)) {
      const code = detectLanguage(text)?.code;
      if (code != null) expect(codes.has(code)).toBe(true);
    }
  });
});

describe("languageColumns", () => {
  it("clears every column when the model isn't loaded, queueing the sweep", () => {
    // The web server never loads GlotLID; its writes must land in the sweep's
    // `lang_detected_at IS NULL` queue rather than as a stamped non-answer.
    expect(languageColumns()).toEqual({
      lang: null,
      langConfidence: null,
      langDetectedAt: null,
      langSource: null,
    });
  });

  it("stamps a detection whether or not it found a language", () => {
    const columns = languageColumns(UNTAGGED);
    expect(columns.lang).toBeNull();
    expect(columns.langDetectedAt).toBeInstanceOf(Date);
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
    ).toEqual(UNTAGGED);
  });

  it("survives every field being null", () => {
    expect(
      detectDocumentLanguage({
        title: null,
        description: null,
        textContent: null,
      }),
    ).toEqual(UNTAGGED);
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
