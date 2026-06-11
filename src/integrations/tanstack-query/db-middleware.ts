import { createMiddleware } from "@tanstack/react-start";

export const dbMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const [{ db }, schema, { resolveTrackReadingHistoryEnabled }] =
      await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
        import("#/server/reader/track-reading-history.server"),
      ]);

    const trackReadingEnabled = await resolveTrackReadingHistoryEnabled(
      db,
      schema,
    );

    return next({
      context: {
        db,
        schema,
        trackReadingEnabled,
      },
    });
  },
);
