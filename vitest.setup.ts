// Several server modules read DATABASE_URL at import time. Unit tests mock the
// DB layer and never connect; this placeholder satisfies module initialization.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/standard_reader_test";
}
