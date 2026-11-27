-- Block allowlist: accounts a reader sees in Standard Reader despite a
-- Bluesky block (either direction, direct or via a moderation list). App-local
-- state, not a repo record — see `blockAllowlist` in `src/db/schema/blocks.ts`.
-- Additive: a new table, no column on `user` (which the auth middleware loads
-- whole on every signed-in request). Must run before code that reads it ships:
-- `notBlockedByViewer` references it on every block-filtered feed query.
CREATE TABLE "block_allowlist" (
	"owner_did" text NOT NULL,
	"subject_did" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_allowlist_owner_did_subject_did_pk" PRIMARY KEY("owner_did","subject_did")
);
