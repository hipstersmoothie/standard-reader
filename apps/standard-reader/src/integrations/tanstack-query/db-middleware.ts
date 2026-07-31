import { createMiddleware } from "@tanstack/react-start";

export const dbMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const [{ db }, schema, { resolveReaderSessionPreferences }] =
      await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
        import("#/server/reader/session-preferences.server"),
      ]);

    const { trackReadingEnabled, countOldPostsAsUnreadEnabled } =
      await resolveReaderSessionPreferences(db, schema);

    return next({
      context: {
        db,
        schema,
        trackReadingEnabled,
        countOldPostsAsUnreadEnabled,
      },
    });
  },
);
