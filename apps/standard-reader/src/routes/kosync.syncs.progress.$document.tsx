import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { kosyncJson, kosyncReader } from "#/server/kosync/http";
import { readPosition } from "#/server/kosync/store";

export const Route = createFileRoute("/kosync/syncs/progress/$document")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const reader = await kosyncReader(request);
        if ("response" in reader) return reader.response;

        const position = await readPosition(
          db,
          schema,
          reader.did,
          params.document,
        );

        // No position yet is not an error — it is the first device to open the
        // book. KOReader treats an empty body as "nothing to restore", which is
        // exactly right; a 404 makes it show a sync failure instead.
        //
        // Deliberately *not* synthesised from the app's own `reading_progress`:
        // that is a percentage, and `progress` has to be a position string this
        // device can act on. Inventing one would jump the reader somewhere the
        // app never meant. The crossover runs the other way — see
        // `writePosition`.
        if (!position) {
          return kosyncJson({ document: params.document });
        }

        return kosyncJson({ ...position });
      },
    },
  },
});
