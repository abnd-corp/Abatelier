ALTER TABLE "pricing_settings" ADD COLUMN "angle_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_settings" ADD COLUMN "angle_max" integer DEFAULT 175 NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_settings" ADD COLUMN "pince_autorisee" boolean DEFAULT false NOT NULL;