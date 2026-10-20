ALTER TABLE "billing_documents" ADD COLUMN "facturx_xml" text;--> statement-breakpoint
-- Le XML Factur-X d'une facture fait partie du document émis : il est figé comme le reste (le PDF qui l'embarque ne change plus).
CREATE OR REPLACE FUNCTION "billing_documents_fige"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Document émis % : il ne se supprime pas.', OLD.numero;
	END IF;
	IF (NEW.type, NEW.numero, NEW.order_id, NEW.client_id, NEW.facture_id, NEW.emis_le, NEW.echeance, NEW.client_nom, NEW.client_adresse, NEW.lignes, NEW.ht, NEW.taux_tva, NEW.tva, NEW.ttc, NEW.pdf, NEW.facturx_xml, NEW.motif)
		IS DISTINCT FROM (OLD.type, OLD.numero, OLD.order_id, OLD.client_id, OLD.facture_id, OLD.emis_le, OLD.echeance, OLD.client_nom, OLD.client_adresse, OLD.lignes, OLD.ht, OLD.taux_tva, OLD.tva, OLD.ttc, OLD.pdf, OLD.facturx_xml, OLD.motif) THEN
		RAISE EXCEPTION 'Document émis % : son contenu ne se modifie plus.', OLD.numero;
	END IF;
	RETURN NEW;
END $$;
