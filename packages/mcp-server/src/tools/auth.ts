import { z } from "zod";

import { errorResult, jsonResult, textResult } from "../format.js";
import type { ToolRegistrar } from "./context.js";

const SIGN_IN_INSTRUCTIONS = [
  "Standard Reader signs in with an AT Protocol **app password** — never the",
  "account password. Create one at https://bsky.app/settings/app-passwords",
  "(or your PDS's equivalent).",
  "",
  "Then either:",
  "",
  "  1. Run once in a terminal, which stores the session on disk:",
  "",
  "       npx standard-reader-mcp login",
  "",
  "  2. Or set these in the MCP server's environment and restart it:",
  "",
  "       STANDARD_READER_IDENTIFIER=your.handle",
  "       STANDARD_READER_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx",
  "",
  "The password is deliberately not accepted as a tool argument so it never",
  "passes through the model's context.",
].join("\n");

export const registerAuthTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "auth",
    {
      title: "Standard Reader account",
      description:
        "Inspect or end the Standard Reader sign-in this server acts with. " +
        "`status` reports who is signed in (public reads work signed out; " +
        "bookmarks, likes, follows, read state and lists do not). " +
        "`instructions` explains how to sign in. `logout` revokes the stored " +
        "session.",
      inputSchema: {
        action: z
          .enum(["status", "instructions", "logout"])
          .describe(
            "status: who is signed in. instructions: how to sign in. " +
              "logout: revoke and forget the stored session.",
          ),
      },
      annotations: { openWorldHint: true, readOnlyHint: false },
    },
    async ({ action }) => {
      try {
        if (action === "instructions") {
          return textResult(SIGN_IN_INSTRUCTIONS);
        }

        if (action === "logout") {
          const hadSession = await ctx.sessions.logout();
          return textResult(
            hadSession
              ? "Signed out; the stored session has been revoked and removed."
              : "There was no stored session to sign out of.",
          );
        }

        const session = await ctx.sessions.current();
        if (!session) {
          return jsonResult({
            signedIn: false,
            service: ctx.config.service,
            hint: 'Call this tool with action "instructions" to sign in.',
          });
        }
        return jsonResult({
          signedIn: true,
          did: session.did,
          handle: session.session.handle,
          pds: session.dispatchUrl,
          service: ctx.config.service,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
