CREATE TABLE "newsletter_publications" (
	"publication_uri" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"from_name" text,
	"from_address" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_send_events" (
	"id" text PRIMARY KEY NOT NULL,
	"send_id" text NOT NULL,
	"recipient" text NOT NULL,
	"type" text NOT NULL,
	"url" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_uri" text NOT NULL,
	"document_uri" text NOT NULL,
	"subject" text NOT NULL,
	"from_address" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_uri" text NOT NULL,
	"email" text NOT NULL,
	"subscriber_did" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'email' NOT NULL,
	"space_record_uri" text,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "newsletter_subscribers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pro_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_send_events" ADD CONSTRAINT "newsletter_send_events_send_id_newsletter_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."newsletter_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_publications_owner_idx" ON "newsletter_publications" USING btree ("owner_did","connected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "newsletter_send_events_send_type_idx" ON "newsletter_send_events" USING btree ("send_id","type");--> statement-breakpoint
CREATE INDEX "newsletter_send_events_time_idx" ON "newsletter_send_events" USING btree ("send_id","occurred_at");--> statement-breakpoint
CREATE INDEX "newsletter_sends_publication_idx" ON "newsletter_sends" USING btree ("publication_uri","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "newsletter_sends_document_idx" ON "newsletter_sends" USING btree ("document_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_pub_email_idx" ON "newsletter_subscribers" USING btree ("publication_uri","email");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_pub_status_idx" ON "newsletter_subscribers" USING btree ("publication_uri","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_custom_domain_idx" ON "sites" USING btree ("custom_domain") WHERE "sites"."custom_domain" is not null;