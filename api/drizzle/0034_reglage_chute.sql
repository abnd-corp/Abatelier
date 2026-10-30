CREATE TABLE "stock_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"chute_min" integer DEFAULT 200 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_settings_single_row" CHECK ("stock_settings"."id" = 1),
	CONSTRAINT "stock_settings_chute_min" CHECK ("stock_settings"."chute_min" between 10 and 1500)
);
