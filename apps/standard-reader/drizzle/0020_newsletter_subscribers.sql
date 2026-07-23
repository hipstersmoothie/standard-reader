CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_uri" text NOT NULL,
	"email" text NOT NULL,
	"subscriber_did" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "newsletter_subscribers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_pub_email_idx" ON "newsletter_subscribers" USING btree ("publication_uri","email");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_pub_status_idx" ON "newsletter_subscribers" USING btree ("publication_uri","status");