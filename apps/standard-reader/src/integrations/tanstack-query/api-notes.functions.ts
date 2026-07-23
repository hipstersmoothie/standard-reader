import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { observe } from "#/server/observability/log";
import { fetchLatestPublicationNote } from "#/server/pckt/notes";

export type { PublicationLatestNote } from "#/server/pckt/notes";

const publicationNoteInput = z.object({
  publicationUri: z.string().min(1),
});

const getPublicationLatestNote = createServerFn({ method: "GET" })
  .validator(publicationNoteInput)
  .handler(
    observe("notes.getPublicationLatestNote", async ({ data }, span) => {
      span.set("publicationUri", data.publicationUri);
      const note = await fetchLatestPublicationNote(data.publicationUri);
      span.set("found", note != null);
      return note;
    }),
  );

function getPublicationLatestNoteQueryOptions(publicationUri: string) {
  return queryOptions({
    queryKey: ["pckt-latest-note", publicationUri] as const,
    queryFn: async () => getPublicationLatestNote({ data: { publicationUri } }),
    staleTime: 5 * 60 * 1000,
  });
}

export const notesApi = {
  getPublicationLatestNote,
  getPublicationLatestNoteQueryOptions,
};
