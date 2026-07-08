CREATE TYPE "public"."category_kind" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."inbound_email_status" AS ENUM('pending', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('email', 'manual');--> statement-breakpoint
CREATE TABLE "budget_alert_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint,
	"threshold" integer NOT NULL,
	"threshold_2" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint NOT NULL,
	"month" date NOT NULL,
	"threshold" integer NOT NULL,
	"usage_percent" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budget_alerts_cat_month_threshold" UNIQUE("category_id","month","threshold")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint NOT NULL,
	"month" date NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budgets_category_month" UNIQUE("category_id","month")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" bigint,
	"color" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"message_id" varchar NOT NULL,
	"from" varchar NOT NULL,
	"subject" varchar,
	"raw_body" text NOT NULL,
	"status" "inbound_email_status" NOT NULL,
	"error_message" text,
	"transaction_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notifiable_type" varchar NOT NULL,
	"notifiable_id" bigint NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pace_alert_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint NOT NULL,
	"threshold" integer NOT NULL,
	"active_from_day" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pace_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint NOT NULL,
	"month" date NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"recovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_category_mappings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint NOT NULL,
	"store_name" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_category_mappings_store_name_unique" UNIQUE("store_name")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"memo" varchar,
	"purchased_at" timestamp with time zone NOT NULL,
	"store_name" varchar NOT NULL,
	"category_id" bigint,
	"source" "transaction_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unclassified_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_alert_settings" ADD CONSTRAINT "budget_alert_settings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pace_alert_settings" ADD CONSTRAINT "pace_alert_settings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pace_alerts" ADD CONSTRAINT "pace_alerts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_category_mappings" ADD CONSTRAINT "store_category_mappings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_categories_parent_id" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_notifiable" ON "notifications" USING btree ("notifiable_type","notifiable_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_read_at" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "idx_pace_alerts_category_id" ON "pace_alerts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_category_id" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_purchased_at" ON "transactions" USING btree ("purchased_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_source" ON "transactions" USING btree ("source");