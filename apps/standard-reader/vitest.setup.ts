// Several server modules read DATABASE_URL at import time. Unit tests mock the
// DB layer and never connect; this placeholder satisfies module initialization.
//
// The gated EXPLAIN benchmark (`pnpm perf:explain`, FEED_PERF_TEST=1) is the one
// spec that DOES connect, against prod Neon via the local .env. Load .env here
// so DATABASE_URL (and the perf-test creds) are present before the placeholder
// below can fire.
import { config } from "dotenv";
config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/standard_reader_test";
}
