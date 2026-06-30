import type { LogAttrs } from "#/server/observability/log";

import { createServerFn } from "@tanstack/react-start";
import { logEvent } from "#/server/observability/log";
import { z } from "zod";

const clientEventInput = z.object({
  name: z.string().min(1).max(120),
  attrs: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .optional(),
});

const recordClientEvent = createServerFn({ method: "POST" })
  .validator(clientEventInput)
  .handler(async ({ data }) => {
    logEvent(data.name, data.attrs as LogAttrs | undefined);
    return { ok: true as const };
  });

export const telemetryApi = {
  recordClientEvent,
};
