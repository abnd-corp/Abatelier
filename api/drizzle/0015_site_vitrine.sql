CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nom" text NOT NULL,
	"email" text NOT NULL,
	"telephone" text,
	"adresse" text,
	"code_postal" text,
	"ville" text,
	"objet" text NOT NULL,
	"message" text NOT NULL,
	"fichier_nom" text,
	"fichier_type" text,
	"fichier" "bytea",
	"traite_at" timestamp with time zone,
	"traite_par" uuid
);
--> statement-breakpoint
CREATE TABLE "site_content" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emplacement" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"largeur" integer NOT NULL,
	"hauteur" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_traite_par_users_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_requests_created_idx" ON "contact_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_photos_place_idx" ON "site_photos" USING btree ("emplacement","position");