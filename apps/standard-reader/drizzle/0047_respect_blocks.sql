-- "Hide blocked accounts" — a signed-in reader can stop their Bluesky blocks
-- from hiding content here. Additive and nullable: `null` keeps blocks
-- enforced, so existing readers need no backfill. See `readerHasBlocks` in
-- `src/server/blocks/blocks.ts`.
ALTER TABLE "user" ADD COLUMN "respect_blocks" boolean;
