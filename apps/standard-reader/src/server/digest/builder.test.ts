import { describe, expect, it } from "vitest";

import { ALL_DIGEST_SECTIONS, digestSectionsFromUser } from "./builder.ts";

describe("digestSectionsFromUser", () => {
  it("defaults every section on when the columns are null/undefined", () => {
    expect(digestSectionsFromUser({})).toEqual(ALL_DIGEST_SECTIONS);
    expect(
      digestSectionsFromUser({
        weeklyDigestSectionSubscriptions: null,
        weeklyDigestSectionNetwork: null,
        weeklyDigestSectionSaved: null,
        weeklyDigestSectionRecommendations: null,
      }),
    ).toEqual(ALL_DIGEST_SECTIONS);
  });

  it("treats an explicit false as an opt-out, everything else as on", () => {
    expect(
      digestSectionsFromUser({
        weeklyDigestSectionSaved: false,
        weeklyDigestSectionNetwork: true,
      }),
    ).toEqual({
      subscriptions: true,
      network: true,
      saved: false,
      recommendations: true,
    });
  });
});
