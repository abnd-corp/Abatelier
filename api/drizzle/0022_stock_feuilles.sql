CREATE TABLE "sheet_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid,
	"libelle" text NOT NULL,
	"delta" integer NOT NULL,
	"apres" integer NOT NULL,
	"motif" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sheet_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"color_id" uuid,
	"largeur" integer NOT NULL,
	"longueur" integer NOT NULL,
	"chute" boolean DEFAULT false NOT NULL,
	"quantite" integer DEFAULT 0 NOT NULL,
	"seuil" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_stock_format" CHECK ("sheet_stock"."largeur" > 0 and "sheet_stock"."longueur" >= "sheet_stock"."largeur"),
	CONSTRAINT "sheet_stock_quantite" CHECK ("sheet_stock"."quantite" >= 0 and "sheet_stock"."seuil" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sheet_movements" ADD CONSTRAINT "sheet_movements_sheet_id_sheet_stock_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet_stock"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_movements" ADD CONSTRAINT "sheet_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_stock" ADD CONSTRAINT "sheet_stock_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_stock" ADD CONSTRAINT "sheet_stock_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheet_movements_sheet_idx" ON "sheet_movements" USING btree ("sheet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_stock_format_idx" ON "sheet_stock" USING btree ("material_id",coalesce("color_id", '00000000-0000-0000-0000-000000000000'::uuid),"largeur","longueur","chute");