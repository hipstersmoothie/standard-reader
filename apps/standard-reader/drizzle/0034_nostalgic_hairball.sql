CREATE TABLE "document_push_queue" (
	"document_uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_topics" (
	"owner_did" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_topics_owner_did_subject_type_subject_pk" PRIMARY KEY("owner_did","subject_type","subject")
);
--> statement-breakpoint
CREATE INDEX "document_push_queue_claim_idx" ON "document_push_queue" USING btree ("state","available_at","created_at");--> statement-breakpoint
CREATE INDEX "document_push_queue_author_idx" ON "document_push_queue" USING btree ("author_did","created_at");--> statement-breakpoint
CREATE INDEX "push_devices_owner_idx" ON "push_devices" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "push_topics_subject_idx" ON "push_topics" USING btree ("subject_type","subject");