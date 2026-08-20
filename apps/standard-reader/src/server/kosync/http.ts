/**
 * The HTTP shapes kosync clients expect.
 *
 * KOReader's sync plugin is unforgiving about the envelope: it reads
 * `authorized`, `message`, `document` and `timestamp` out of a flat JSON body
 * and treats anything else as a failure. These helpers keep every route
 * speaking that dialect rather than the app's.
 */

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";

import { authenticateKosync } from "./credentials";
import { didForKosyncUsername } from "./store";

export function kosyncJson(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

/** KOReader shows `message` to the reader verbatim, so it is worth writing. */
export function kosyncError(message: string, status: number): Response {
  return kosyncJson({ code: status, message }, status);
}

/**
 * The reader behind a request's credentials, or a ready-made 401.
 *
 * Returns a tuple rather than throwing so handlers stay flat — there is no
 * error boundary in a route handler that would render a kosync-shaped body.
 */
export async function kosyncReader(
  request: Request,
): Promise<{ did: string } | { response: Response }> {
  const did = await authenticateKosync(request, (username) =>
    didForKosyncUsername(db, schema, username),
  );
  if (!did) {
    return {
      response: kosyncError(
        "Unauthorized. Use your Standard Reader handle and the sync key from Settings.",
        401,
      ),
    };
  }
  return { did };
}
