import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";
import { describe, expect, it } from "vitest";

import { documentSearchText, repairCompoundedSearchText } from "./search-text";

const BODY = "shoulders are badly designed.\n\nmost joints favor stability.";

/** pckt content whose extracted plaintext equals `BODY`. */
const pcktJson = {
  $type: PCKT_CONTENT,
  items: BODY.split("\n\n").map((plaintext) => ({
    $type: PCKT_BLOCK.text,
    plaintext,
  })),
};

describe("documentSearchText", () => {
  it("doesn't duplicate the body when record text matches extracted blocks", () => {
    expect(
      documentSearchText({
        textContent: BODY,
        contentJson: pcktJson,
        contentFormat: PCKT_CONTENT,
      }),
    ).toBe(BODY);
  });

  it("dedupes on normalized whitespace, not exact equality", () => {
    const reflowed = BODY.replaceAll("\n\n", "\n");
    expect(
      documentSearchText({
        textContent: reflowed,
        contentJson: pcktJson,
        contentFormat: PCKT_CONTENT,
      }),
    ).toBe(reflowed);
  });

  it("dedupes when only markdown decoration differs (bullets, headings)", () => {
    const decorated = `# ${BODY.replaceAll("\n\n", "\n- ")}`;
    expect(
      documentSearchText({
        textContent: decorated,
        contentJson: pcktJson,
        contentFormat: PCKT_CONTENT,
      }),
    ).toBe(decorated);
  });

  it("keeps record text that extends beyond the extracted blocks", () => {
    const extended = `${BODY}\n\nbonus paragraph only in the record.`;
    expect(
      documentSearchText({
        textContent: extended,
        contentJson: pcktJson,
        contentFormat: PCKT_CONTENT,
      }),
    ).toBe(extended);
  });

  it("is a fixed point when fed its own output (backfill idempotency)", () => {
    const first = documentSearchText({
      textContent: BODY,
      contentJson: pcktJson,
      contentFormat: PCKT_CONTENT,
    });
    const second = documentSearchText({
      textContent: first,
      contentJson: pcktJson,
      contentFormat: PCKT_CONTENT,
    });
    expect(second).toBe(first);
  });
});

describe("repairCompoundedSearchText", () => {
  it("strips repeated extracted copies appended by the old backfill", () => {
    const compounded = [BODY, BODY, BODY, BODY].join("\n\n");
    expect(repairCompoundedSearchText(compounded, BODY)).toBe(BODY);
  });

  it("preserves record text ahead of the compounded copies", () => {
    const record = `${BODY}\n\nbonus paragraph only in the record.`;
    const compounded = [record, BODY, BODY].join("\n\n");
    expect(repairCompoundedSearchText(compounded, BODY)).toBe(record);
  });

  it("falls back to the extracted text when stale copies don't match exactly", () => {
    // Copies appended by an older extractor version differ in whitespace, so
    // suffix-stripping can't remove them — but normalized matching can see the
    // body appears more than once.
    const staleCopy = BODY.replaceAll("\n\n", "\n");
    const compounded = [BODY, staleCopy].join("\n\n");
    expect(repairCompoundedSearchText(compounded, BODY)).toBe(BODY);
  });

  it("leaves blobs without duplication untouched", () => {
    const record = `${BODY}\n\nbonus paragraph only in the record.`;
    expect(repairCompoundedSearchText(record, BODY)).toBe(record);
    expect(repairCompoundedSearchText(record, null)).toBe(record);
  });
});
