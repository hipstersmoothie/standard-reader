// Several server modules read DATABASE_URL when they construct the DB client.
// Unit tests here cover DB-free pure logic and never connect; this placeholder
// just satisfies any module that inspects the env at import time. Loading .env
// first lets a developer point tests at a real local DB if they add one.
import { config } from "dotenv";

config();

if (!process.env.DATABASE_URL) {
  // Intentionally unreachable host — a test that tries to connect should fail
  // loudly rather than hit a real database.
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/standard_newsletter_test";
}
