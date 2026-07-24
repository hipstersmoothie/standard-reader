ALTER TABLE "sidebar_prefs" ADD COLUMN "customize_nav" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sidebar_prefs" ADD COLUMN "hidden_nav" jsonb DEFAULT '[]'::jsonb NOT NULL;