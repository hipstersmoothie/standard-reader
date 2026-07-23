import "dotenv/config";
import { hasPerfSignedInCredentials } from "./lib/auth.ts";
import { bootstrapPerfAuth } from "./lib/bootstrap-session.ts";

export default async function globalSetup(): Promise<void> {
  if (!hasPerfSignedInCredentials()) {
    return;
  }

  await bootstrapPerfAuth();
}
