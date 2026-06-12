import type { ExtensionSessionResponse } from "#/server/extension/types";

import { createFileRoute } from "@tanstack/react-router";
import { resolveIdentity } from "#/server/atproto/identity";
import { getExtensionSession } from "#/server/extension/auth.server";

export const Route = createFileRoute("/api/extension/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getExtensionSession(request);
        if (!session) {
          const body: ExtensionSessionResponse = {
            signedIn: false,
            handle: null,
            name: null,
            image: null,
            did: null,
          };
          return Response.json(body);
        }

        let handle: string | null = null;
        try {
          const identity = await resolveIdentity(session.did);
          handle = identity.handle;
        } catch {
          // optional enrichment
        }

        const body: ExtensionSessionResponse = {
          signedIn: true,
          handle,
          name: session.session.user.name ?? null,
          image: session.session.user.image ?? null,
          did: session.did,
        };
        return Response.json(body);
      },
    },
  },
});
