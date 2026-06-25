import { describe, expect, it } from "vitest";

import { score } from "./detector.ts";

// A passage stuffed with the usual LLM tells: even sentence rhythm, clichés,
// hedging, and transition-word scaffolding.
const AI_SAMPLE = `
In today's fast-paced world, it is important to note that artificial intelligence
plays a crucial role in shaping the future. Moreover, the rich tapestry of modern
technology continues to evolve at a remarkable pace. Furthermore, it is worth noting
that businesses must navigate the complexities of this ever-changing landscape.
Additionally, organizations should harness the power of data to unlock the potential
of their operations. Consequently, leaders are encouraged to delve into the realm of
innovation. Ultimately, it is important to remember that success is a testament to
careful planning. Notably, the world of business rewards those who adapt. Overall,
embracing change remains a game changer for forward-thinking teams. Therefore, the
path forward is clear and full of opportunity for those willing to take the leap.
`;

// Human writing: varied sentence length, concrete detail, no scaffolding.
const HUMAN_SAMPLE = `
The kettle screamed. I'd forgotten it again, third time this week, and the cat shot
out from under the table like a furred bottle rocket. Outside, rain. Not the dramatic
kind — just that steady gray drizzle that makes you reconsider every plan you ever made.
My grandmother used to say weather like this was good for nothing but bread and grudges.
She baked a lot. I poured the tea, watched it go the color of an old penny, and thought
about calling my brother. We hadn't spoken since August, since the thing with the boat,
which was either his fault or mine depending on who you asked and how much they'd had.
I didn't call. I drank the tea. The cat came back, eventually, pretending nothing had
happened, which is the only way cats ever apologize, and honestly the only apology I
trust anymore.
`;

describe("score", () => {
  it("flags slop-heavy prose as likely AI", () => {
    const result = score(AI_SAMPLE);
    expect(result.classification).toBe("likely-ai");
    expect(result.score).toBeGreaterThan(0.6);
  });

  it("passes varied human prose", () => {
    const result = score(HUMAN_SAMPLE);
    expect(result.classification).toBe("human");
    expect(result.score).toBeLessThan(0.42);
  });

  it("stays neutral on short text it can't judge", () => {
    const result = score("Too short to tell.");
    expect(result.score).toBe(0);
    expect(result.classification).toBe("human");
  });

  it("scores the AI sample higher than the human sample", () => {
    expect(score(AI_SAMPLE).score).toBeGreaterThan(score(HUMAN_SAMPLE).score);
  });
});
