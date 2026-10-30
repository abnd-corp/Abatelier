CREATE TABLE "production_checks" (
	"order_id" uuid NOT NULL,
	"cle" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_checks_order_id_cle_pk" PRIMARY KEY("order_id","cle"),
	CONSTRAINT "production_checks_count" CHECK ("production_checks"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_checks" ADD CONSTRAINT "production_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_checks" ADD CONSTRAINT "production_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;