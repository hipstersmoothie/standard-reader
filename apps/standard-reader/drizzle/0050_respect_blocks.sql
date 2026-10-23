-- "Hide blocked accounts" — a signed-in reader can stop their Bluesky blocks
-- from hiding content here. Additive and nullable: `null` keeps blocks
-- enforced, so existing readers need no backfill. See `readerHasBlocks` in
-- `src/server/blocks/blocks.ts`.
-- IF NOT EXISTS: this was 0047 until main took 0047–0049, and the PR's
-- preview database had already run it under that number. Prod never had it.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "respect_blocks" boolean;
