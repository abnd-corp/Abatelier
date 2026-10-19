CREATE TABLE "client_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"adresse" text NOT NULL,
	"code_postal" text NOT NULL,
	"ville" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"raison_sociale" text,
	"siret" text,
	"tva_intra" text,
	"prenom" text,
	"nom" text,
	"email" text,
	"telephone" text,
	"adresse" text,
	"code_postal" text,
	"ville" text,
	"origine" text NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_identite" CHECK (("clients"."type" = 'professionnel' and "clients"."raison_sociale" is not null) or ("clients"."type" = 'particulier' and "clients"."nom" is not null))
);
--> statement-breakpoint
ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_sites_client_idx" ON "client_sites" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_email_idx" ON "clients" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "clients_nom_idx" ON "clients" USING btree ("nom","prenom");