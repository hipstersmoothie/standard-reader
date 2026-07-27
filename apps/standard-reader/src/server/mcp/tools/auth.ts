import { z } from "zod";

import { errorResult, jsonResult } from "../format";
import { MCP_SCOPES } from "../session";
import { READ_ONLY } from "./context";
import type { ToolRegistrar } from "./context";

export const registerAuthTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "whoami",
    {
      title: "Who this connection acts as",
      description:
        "Report which Standard Reader account authorized this connection and " +
        "what it is allowed to do. Public reads work for anyone; a reader's " +
        "own library, statuses and every write need an authorized connection " +
        "with the right scope. Call this when a tool reports an auth problem, " +
        "so you can tell the user whether to reconnect or to re-authorize " +
        "with write access.",
      inputSchema: {
        verify: z
          .boolean()
          .default(false)
          .describe(
            "Also check that Standard Reader still holds a usable AT Protocol " +
              "session for this reader. Costs a round trip; worth it when a " +
              "write just failed.",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ verify }) => {
      try {
        const { session } = ctx;
        if (!session.signedIn) {
          return jsonResult({
            authorized: false,
            canRead: true,
            canWrite: false,
            note:
              "Anonymous connection — public reads only. Connect the Standard " +
              "Reader connector and authorize it to reach a reader's library " +
              "or make changes.",
          });
        }

        const sessionUsable = verify ? (await session.auth()) !== null : null;
        return jsonResult({
          authorized: true,
          did: session.did,
          handle: session.handle,
          client: session.clientName,
          scopes: session.scopes,
          canRead: session.scopes.includes(MCP_SCOPES.read),
          canWrite: session.canWrite,
          atprotoSessionUsable: sessionUsable,
          note:
            sessionUsable === false
              ? "Standard Reader's stored AT Protocol session for this reader is " +
                "gone. They need to sign in again at " +
                "https://standard-reader.app before writes will work."
              : undefined,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
