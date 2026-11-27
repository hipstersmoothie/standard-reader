CREATE TABLE "muted_words" (
	"owner_did" text NOT NULL,
	"word" text NOT NULL,
	"pattern" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "muted_words_owner_did_word_pk" PRIMARY KEY("owner_did","word")
);
