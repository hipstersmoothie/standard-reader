CREATE TABLE "sidebar_prefs" (
	"owner_did" text PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"cid" text,
	"rkey" text NOT NULL,
	"list_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collapsed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
