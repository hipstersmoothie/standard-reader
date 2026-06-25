/**
 * The labeler's self-description: which label values it emits and how clients
 * should present them. A real Bluesky labeler publishes this as an
 * `app.bsky.labeler.service` record in its repo; a `did:web` has no repo, so we
 * serve the same information from an XRPC endpoint
 * (`app.standard-reader.labeler.getServices`) instead.
 */

import { config } from "./config.ts";

export function labelerServiceView() {
  return {
    did: config.labelerDid,
    displayName: "claudeslop",
    description:
      "Flags prose that a heuristic detector thinks reads like AI slop. A vibe check, not proof.",
    policies: {
      labelValues: [config.labelValue],
      labelValueDefinitions: [
        {
          identifier: config.labelValue,
          severity: "inform",
          blurs: "none",
          defaultSetting: "warn",
          adultOnly: false,
          locales: [
            {
              lang: "en",
              name: "AI writing",
              description:
                "claudeslop's heuristic detector scored this document as likely AI-generated prose. " +
                "It weighs signals like sentence-length uniformity, cliché and hedging density, and " +
                "transition-word scaffolding. It is an informational vibe check, not proof of authorship.",
            },
          ],
        },
      ],
    },
    indexedAt: new Date().toISOString(),
  };
}
