import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { getPublicUrl } from "#/lib/public-url";
import { shelfReader, shelfReaderName } from "#/server/books/reader-shelf";
import { shelfNavigation } from "#/server/opds/catalog";
import { savedListsForReader } from "#/server/reader/saved-lists";

export const Route = createFileRoute("/opds/u/$did/")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const [reader, lists] = await Promise.all([
          shelfReader(db, schema, did),
          savedListsForReader(db, did),
        ]);

        return opdsResponse(
          shelfNavigation({
            baseUrl: getPublicUrl(),
            did,
            lists: lists.map((list) => ({
              description: list.description,
              name: list.name,
              rkey: list.rkey,
            })),
            readerName: shelfReaderName(reader, did),
            trackReadingHistory: reader.trackReadingHistory,
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});
