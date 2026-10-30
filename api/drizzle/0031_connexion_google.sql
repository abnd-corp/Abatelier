ALTER TABLE "client_accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_google_sub_unique" UNIQUE("google_sub");