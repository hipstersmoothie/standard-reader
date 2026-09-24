-- "Bridged accounts: Hide all" — a signed-in reader can now hide every
-- `*.brid.gy` repo (both Bridgy Fed bridges), not just the bulk web mirrors
-- `exclude_web_bridge` covers. Additive and nullable: `null` keeps whatever
-- `exclude_web_bridge` already says. See `src/lib/exclude-web-bridge.ts`.
ALTER TABLE "user" ADD COLUMN "exclude_all_bridges" boolean;
