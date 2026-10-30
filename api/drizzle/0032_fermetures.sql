CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"motif" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closures_dates_check" CHECK ("closures"."fin" >= "closures"."debut")
);
