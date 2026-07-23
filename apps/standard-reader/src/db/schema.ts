/**
 * Re-export shim. The schema now lives in the shared `@standard-reader/db`
 * package so the reader and newsletter apps share one source of truth. This
 * keeps every existing `#/db/schema` import (and drizzle-kit) working unchanged.
 */
export * from "@standard-reader/db/schema";
