CREATE TABLE "order_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"statut" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"repere" text,
	"modele" text NOT NULL,
	"material_id" uuid,
	"material_label" text NOT NULL,
	"color_id" uuid,
	"color_label" text NOT NULL,
	"color_hex" text NOT NULL,
	"cotes" integer[] NOT NULL,
	"angles" integer[] NOT NULL,
	"longueur" integer NOT NULL,
	"quantite" integer NOT NULL,
	"accessoires" jsonb NOT NULL,
	"prix_unitaire" numeric(12, 2) NOT NULL,
	"remise_quantite" numeric(5, 2) NOT NULL,
	"montant_pieces" numeric(12, 2) NOT NULL,
	"montant_accessoires" numeric(12, 2) NOT NULL,
	"mise_en_route" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"client_id" uuid NOT NULL,
	"statut" text DEFAULT 'recue' NOT NULL,
	"livraison_mode" text NOT NULL,
	"livraison_adresse" text,
	"livraison_code_postal" text,
	"livraison_ville" text,
	"distance_km" numeric(7, 1),
	"notes" text,
	"brut" numeric(12, 2) NOT NULL,
	"remise_pro" numeric(12, 2) NOT NULL,
	"complement_minimum" numeric(12, 2) NOT NULL,
	"livraison_prix" numeric(12, 2) NOT NULL,
	"ht" numeric(12, 2) NOT NULL,
	"taux_tva" numeric(5, 2) NOT NULL,
	"tva" numeric(12, 2) NOT NULL,
	"ttc" numeric(12, 2) NOT NULL,
	"delai_jours" integer NOT NULL,
	"date_prevue" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "orders_statut_idx" ON "orders" USING btree ("statut");