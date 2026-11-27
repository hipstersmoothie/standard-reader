-- "Image server" — which Bluesky-CDN-compatible host a signed-in reader's
-- browser loads blob images from. Additive and nullable: `null` = cdn.bsky.app,
-- so existing readers need no backfill. See `src/lib/image-cdn.ts`.
-- IF NOT EXISTS: this was 0051, then 0052, until main took both numbers, and
-- the PR's preview database had already run it under an earlier number. Prod
-- never had it.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image_cdn" text;
