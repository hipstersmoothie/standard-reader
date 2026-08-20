import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { kosyncError, kosyncJson, kosyncReader } from "#/server/kosync/http";
import { writePosition } from "#/server/kosync/store";

/**
 * What KOReader PUTs after a page turn.
 *
 * `progress` is a string in both modes — an xpointer for reflowable books, a
 * page number for paged ones — and `percentage` is the 0–1 fraction. Older
 * builds omit `device_id`.
 */
const progressInput = z.object({
  device: z.string().max(200).optional().nullable(),
  device_id: z.string().max(200).optional().nullable(),
  document: z.string().min(1).max(200),
  percentage: z.coerce.number().min(0).max(1),
  progress: z.string().min(1).max(2000),
});

export const Route = createFileRoute("/kosync/syncs/progress/")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const reader = await kosyncReader(request);
        if ("response" in reader) return reader.response;

        const parsed = progressInput.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          return kosyncError("Invalid progress payload.", 400);
        }

        await writePosition(db, schema, reader.did, {
          device: parsed.data.device ?? null,
          deviceId: parsed.data.device_id ?? null,
          document: parsed.data.document,
          percentage: parsed.data.percentage,
          progress: parsed.data.progress,
        });

        return kosyncJson({
          document: parsed.data.document,
          timestamp: Math.floor(Date.now() / 1000),
        });
      },
    },
  },
});
