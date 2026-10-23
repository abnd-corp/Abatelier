ALTER TABLE "contact_requests" ADD COLUMN "configuration" jsonb;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD COLUMN "commande_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_commande_id_orders_id_fk" FOREIGN KEY ("commande_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;