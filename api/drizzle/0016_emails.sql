CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"destinataires" text NOT NULL,
	"objet" text NOT NULL,
	"statut" text NOT NULL,
	"erreur" text,
	"target_type" text,
	"target_id" text,
	"user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_at_idx" ON "email_log" USING btree ("at");