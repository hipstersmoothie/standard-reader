CREATE TABLE "labeler_subscriptions" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text,
	"subscriber_did" text NOT NULL,
	"rkey" text NOT NULL,
	"labeler_did" text NOT NULL,
	"created_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "labeler_subscriptions_subscriber_idx" ON "labeler_subscriptions" USING btree ("subscriber_did");--> statement-breakpoint
CREATE INDEX "labeler_subscriptions_labeler_idx" ON "labeler_subscriptions" USING btree ("labeler_did");
