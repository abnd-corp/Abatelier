CREATE TABLE "billing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"numero" text NOT NULL,
	"order_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"facture_id" uuid,
	"emis_le" timestamp with time zone DEFAULT now() NOT NULL,
	"echeance" date,
	"client_nom" text NOT NULL,
	"client_adresse" text NOT NULL,
	"lignes" jsonb NOT NULL,
	"ht" numeric(12, 2) NOT NULL,
	"taux_tva" numeric(5, 2) NOT NULL,
	"tva" numeric(12, 2) NOT NULL,
	"ttc" numeric(12, 2) NOT NULL,
	"pdf" "bytea" NOT NULL,
	"motif" text,
	"envoye_le" timestamp with time zone,
	"reponse" text,
	"reponse_le" timestamp with time zone,
	"paye_le" date,
	"mode_paiement" text,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_documents_numero_unique" UNIQUE("numero"),
	CONSTRAINT "billing_documents_avoir" CHECK (("billing_documents"."type" = 'avoir') = ("billing_documents"."facture_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_facture_id_billing_documents_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."billing_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_documents_order_idx" ON "billing_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "billing_documents_client_idx" ON "billing_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "billing_documents_type_idx" ON "billing_documents" USING btree ("type","emis_le");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_documents_facture_idx" ON "billing_documents" USING btree ("facture_id");--> statement-breakpoint
-- Document émis = figé : seul le suivi (envoi, réponse, paiement) peut changer, et rien ne se supprime.
-- Les factures se conservent 10 ans ; une erreur se corrige par un avoir.
CREATE FUNCTION "billing_documents_fige"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Document émis % : il ne se supprime pas.', OLD.numero;
	END IF;
	IF (NEW.type, NEW.numero, NEW.order_id, NEW.client_id, NEW.facture_id, NEW.emis_le, NEW.echeance, NEW.client_nom, NEW.client_adresse, NEW.lignes, NEW.ht, NEW.taux_tva, NEW.tva, NEW.ttc, NEW.pdf, NEW.motif)
		IS DISTINCT FROM (OLD.type, OLD.numero, OLD.order_id, OLD.client_id, OLD.facture_id, OLD.emis_le, OLD.echeance, OLD.client_nom, OLD.client_adresse, OLD.lignes, OLD.ht, OLD.taux_tva, OLD.tva, OLD.ttc, OLD.pdf, OLD.motif) THEN
		RAISE EXCEPTION 'Document émis % : son contenu ne se modifie plus.', OLD.numero;
	END IF;
	RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "billing_documents_fige" BEFORE UPDATE OR DELETE ON "billing_documents" FOR EACH ROW EXECUTE FUNCTION "billing_documents_fige"();
