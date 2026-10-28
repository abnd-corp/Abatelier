CREATE TABLE "sheet_barcodes" (
	"code" text PRIMARY KEY NOT NULL,
	"sheet_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sheet_barcodes" ADD CONSTRAINT "sheet_barcodes_sheet_id_sheet_stock_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet_stock"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_barcodes" ADD CONSTRAINT "sheet_barcodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;