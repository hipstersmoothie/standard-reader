/**
 * The per-record decision.
 *
 * A conversion that drops a table or a poll is not something to decide once for
 * a whole repo — the answer depends on the document. So each record with
 * warnings is offered on its own, with "yes/no to all" available for the person
 * who has seen enough.
 */

import { createInterface } from "node:readline/promises";

export type Decision = "convert" | "skip" | "quit";

export type Answer = Decision | "convert-all" | "skip-all" | "details";

export interface Prompter {
  ask: (question: string) => Promise<Answer>;
  close: () => void;
}

const ANSWERS: Record<string, Answer> = {
  a: "convert-all",
  all: "convert-all",
  d: "details",
  details: "details",
  n: "skip",
  no: "skip",
  q: "quit",
  quit: "quit",
  s: "skip-all",
  skip: "skip",
  y: "convert",
  yes: "convert",
};

export const PROMPT_HELP =
  "[y] convert  [n] skip  [d] details  [a] convert all  [s] skip all  [q] quit";

/** A prompter backed by the terminal. Returns null when there is no TTY. */
export function createPrompter(): Prompter | null {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return null;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: async (question: string) => {
      for (;;) {
        const reply = await rl.question(question);
        const raw = reply.trim().toLowerCase();
        // Enter alone is the safe answer: leave the record as it is.
        if (raw === "") return "skip";
        const answer = ANSWERS[raw];
        if (answer) return answer;
        process.stdout.write(`  ${PROMPT_HELP}\n`);
      }
    },
    close: () => {
      rl.close();
    },
  };
}
