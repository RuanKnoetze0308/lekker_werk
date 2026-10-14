CREATE TYPE "public"."qr_mode" AS ENUM('STATIC', 'DYNAMIC');--> statement-breakpoint
CREATE TYPE "public"."shop_category" AS ENUM('RFID', 'TABLET', 'MOUNT', 'NFC', 'BIOMETRIC', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."shop_order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by" uuid,
	"status" "shop_order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"total_cents" integer NOT NULL,
	"m_payment_id" text NOT NULL,
	"pf_payment_id" text,
	"delivery_name" text NOT NULL,
	"delivery_phone" text NOT NULL,
	"delivery_address" text NOT NULL,
	"notes" text,
	"tracking_note" text,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"itn" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "shop_category" DEFAULT 'OTHER' NOT NULL,
	"price_cents" integer NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "acting_company_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "mode" "qr_mode" DEFAULT 'STATIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "rotation_seconds" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_order_items_order_idx" ON "shop_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_m_payment_uq" ON "shop_orders" USING btree ("m_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_pf_payment_uq" ON "shop_orders" USING btree ("pf_payment_id");--> statement-breakpoint
CREATE INDEX "shop_orders_company_idx" ON "shop_orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shop_orders_status_idx" ON "shop_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "shop_products_active_idx" ON "shop_products" USING btree ("active","sort_order");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_acting_company_id_companies_id_fk" FOREIGN KEY ("acting_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;