import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in the .env file");
}

export default defineConfig({
  // Schema lives in the shared @standard-reader/db package; point drizzle-kit at
  // the source file directly (no path alias) so migration generation resolves
  // its relative ./schema/*.ts imports without needing the tsconfig alias.
  schema: "../../packages/db/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
