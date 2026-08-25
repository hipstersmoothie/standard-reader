import { createFileRoute } from "@tanstack/react-router";

import { kosyncError } from "#/server/kosync/http";

/**
 * Registration, refused.
 *
 * A reference kosync server lets any device create an account. Here the account
 * already exists — it is the reader's AT Proto identity — and there is nothing
 * for a device to register. Answering with a clear message beats a 404: KOReader
 * shows `message` to the reader, so this is where they find out where their key
 * lives.
 */
export const Route = createFileRoute("/kosync/users/create")({
  server: {
    handlers: {
      POST: () =>
        kosyncError(
          "Standard Reader has no separate sync account. Use your handle as the username and the sync key from Settings → E-readers as the password.",
          403,
        ),
    },
  },
});
