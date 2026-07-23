/**
 * Analytics data access. `getPublications` runs on the server: it reads the
 * shared reader DB via `analytics.server`, and falls back to sample data when no
 * DB is configured or the query fails — so the app runs in dev/demo without
 * credentials and uses real publications/subscribers/posts when DATABASE_URL is
 * present.
 */

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { Publication } from "../data/publications";
import { PUBS } from "../data/publications";

export const getPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<Publication[]> => {
    try {
      const { loadPublicationsFromDb } = await import("./analytics.server");
      const rows = await loadPublicationsFromDb();
      if (rows && rows.length > 0) return rows;
    } catch (error) {
      console.error(
        "[standard-newsletter] DB unavailable, using sample data:",
        error,
      );
    }
    return PUBS;
  },
);

export function publicationsQueryOptions() {
  return queryOptions({
    queryKey: ["publications"],
    queryFn: () => getPublications(),
    staleTime: 60_000,
  });
}
