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
ALTER TABLE "newsletter_send_events" ADD CONSTRAINT "newsletter_send_events_send_id_newsletter_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."newsletter_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_send_events_send_type_idx" ON "newsletter_send_events" USING btree ("send_id","type");--> statement-breakpoint
CREATE INDEX "newsletter_send_events_time_idx" ON "newsletter_send_events" USING btree ("send_id","occurred_at");--> statement-breakpoint
CREATE INDEX "newsletter_sends_publication_idx" ON "newsletter_sends" USING btree ("publication_uri","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "newsletter_sends_document_idx" ON "newsletter_sends" USING btree ("document_uri");