CREATE TABLE "labeler_services" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"owner_did" text NOT NULL,
	"rkey" text NOT NULL,
	"labeler_did" text NOT NULL,
	"service_endpoint" text NOT NULL,
	"display_name" text,
	"description" text,
	"avatar_url" text,
	"label_value_definitions" jsonb,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "labeler_services_labeler_idx" ON "labeler_services" USING btree ("labeler_did");