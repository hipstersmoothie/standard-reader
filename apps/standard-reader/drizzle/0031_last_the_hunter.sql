CREATE TABLE "network_stats" (
	"key" text PRIMARY KEY NOT NULL,
	"value" bigint NOT NULL,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the Latest "All" badge so the new read path never falls back to the live
-- scan it exists to remove. Without this, every /latest load between deploy and
-- the first `recomputeNetworkStats()` sweep pays the ~1s count. Runs once, in
-- preDeployCommand, before traffic switches. Mirrors the predicate in
-- `countNetworkDocumentsLive` / `recomputeNetworkStats`.
INSERT INTO "network_stats" ("key", "value", "recomputed_at")
SELECT 'network_document_count', count(*), now()
FROM "documents" d
LEFT JOIN "publications" p ON p."uri" = d."publication_uri"
WHERE d."deleted" = false
	AND (d."published_at" IS NULL OR d."published_at" <= now())
	AND (
		p."uri" IS NULL
		OR (p."deleted" = false AND p."show_in_discover" = true AND p."url" NOT ILIKE '%blento.app%')
	)
ON CONFLICT ("key") DO NOTHING;
