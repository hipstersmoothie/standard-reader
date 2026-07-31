import { describe, expect, it } from "vitest";

import { labelDefinitions } from "./atproto-labeler.server.ts";

describe("labelDefinitions", () => {
  it("reads full definitions from a labeler's policies", () => {
    // Verbatim shape of pub-search's published app.bsky.labeler.service record.
    const defs = labelDefinitions({
      policies: {
        labelValues: ["bulk-generated"],
        labelValueDefinitions: [
          {
            identifier: "bulk-generated",
            severity: "inform",
            blurs: "none",
            defaultSetting: "ignore",
            adultOnly: false,
            locales: [
              {
                lang: "en",
                name: "bulk-generated",
                description: "generated from a data source",
              },
            ],
          },
        ],
      },
    });

    expect(defs).toHaveLength(1);
    expect(defs?.[0]?.identifier).toBe("bulk-generated");
    expect(defs?.[0]?.locales?.[0]?.description).toBe(
      "generated from a data source",
    );
  });

  it("synthesizes a definition for a bare value with no definition", () => {
    // `labelValues` and `labelValueDefinitions` are independent fields; a
    // labeler may publish only the former, and the value must still render.
    const defs = labelDefinitions({ policies: { labelValues: ["spam"] } });
    expect(defs).toEqual([{ identifier: "spam" }]);
  });

  it("does not duplicate a value that already has a definition", () => {
    const defs = labelDefinitions({
      policies: {
        labelValues: ["spam", "bot"],
        labelValueDefinitions: [{ identifier: "spam", severity: "alert" }],
      },
    });
    expect(defs).toEqual([
      { identifier: "spam", severity: "alert" },
      { identifier: "bot" },
    ]);
  });

  it("returns null when the labeler declares no label values", () => {
    expect(labelDefinitions({})).toBeNull();
    expect(labelDefinitions({ policies: {} })).toBeNull();
  });
});
