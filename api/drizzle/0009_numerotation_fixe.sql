ALTER TABLE "document_counters" ADD COLUMN "utilise" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_template" DROP COLUMN "prefixe_devis";--> statement-breakpoint
ALTER TABLE "document_template" DROP COLUMN "prefixe_facture";