import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Standard Writer only owns the `writer_drafts` table; the reader owns the auth
// tables on the shared database. Point drizzle-kit at just the drafts schema so
// generated migrations never touch tables the reader manages. A placeholder URL
// keeps `generate` (which never connects) working offline; real migrate/push/
// studio require a real `DATABASE_URL`.
export default defineConfig({
  schema: "./src/db/schema/drafts.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder/placeholder",
  },
});
