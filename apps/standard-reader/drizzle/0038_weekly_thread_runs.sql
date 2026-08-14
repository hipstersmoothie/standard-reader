CREATE TABLE "weekly_thread_runs" (
	"period_key" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"root_uri" text,
	"post_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
