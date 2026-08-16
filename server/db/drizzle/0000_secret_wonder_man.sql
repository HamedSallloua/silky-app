CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('web', 'social_media', 'instagram', 'whatsapp', 'phone');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'processing', 'completed', 'cancelled', 'exchanged');--> statement-breakpoint
CREATE TYPE "public"."store_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone_number" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"color_slug" varchar(64),
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size" varchar(16) NOT NULL,
	"color_slug" varchar(64) NOT NULL,
	"color_name" varchar(64) NOT NULL,
	"color_image_url" text,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"sku" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "uq_product_variants_product_size_color" UNIQUE("product_id","size","color_slug"),
	CONSTRAINT "product_variants_stock_non_negative" CHECK ("product_variants"."stock_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" numeric(10, 3) NOT NULL,
	"discount_amount" numeric(10, 3) DEFAULT '0' NOT NULL,
	"category_id" uuid NOT NULL,
	"collection_image_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_discount_non_negative" CHECK ("products"."discount_amount" >= 0),
	CONSTRAINT "products_discount_not_greater_than_price" CHECK ("products"."discount_amount" <= "products"."price")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cart_items_cart_variant" UNIQUE("cart_id","variant_id"),
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"guest_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_owner_check" CHECK ("carts"."user_id" IS NOT NULL OR "carts"."guest_session_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "favourites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"guest_session_id" uuid,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourites_owner_check" CHECK ("favourites"."user_id" IS NOT NULL OR "favourites"."guest_session_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "exchange_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_title" varchar(255) NOT NULL,
	"variant_label" varchar(255),
	"image_url" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_items_quantity_positive" CHECK ("exchange_items"."quantity" > 0),
	CONSTRAINT "exchange_items_unit_price_non_negative" CHECK ("exchange_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"email_type" varchar(64) NOT NULL,
	"status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "uq_order_email_deliveries_order_type" UNIQUE("order_id","email_type")
);
--> statement-breakpoint
CREATE TABLE "order_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"exchange_number" varchar(64) NOT NULL,
	"exchange_sequence" integer DEFAULT 1 NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255),
	"customer_phone" varchar(32) NOT NULL,
	"shipping_address" text NOT NULL,
	"subtotal" numeric(10, 3) NOT NULL,
	"delivery_fee" numeric(10, 3) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_exchanges_exchange_number_unique" UNIQUE("exchange_number"),
	CONSTRAINT "order_exchanges_subtotal_non_negative" CHECK ("order_exchanges"."subtotal" >= 0),
	CONSTRAINT "order_exchanges_delivery_fee_non_negative" CHECK ("order_exchanges"."delivery_fee" >= 0),
	CONSTRAINT "order_exchanges_total_amount_non_negative" CHECK ("order_exchanges"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_title" varchar(255) NOT NULL,
	"variant_label" varchar(255),
	"image_url" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_non_negative" CHECK ("order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"user_id" uuid,
	"guest_session_id" uuid,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255),
	"customer_phone" varchar(32) NOT NULL,
	"shipping_address" text NOT NULL,
	"subtotal" numeric(10, 3) NOT NULL,
	"delivery_fee" numeric(10, 3) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 3) NOT NULL,
	"order_source" "order_source" DEFAULT 'web' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_subtotal_non_negative" CHECK ("orders"."subtotal" >= 0),
	CONSTRAINT "orders_delivery_fee_non_negative" CHECK ("orders"."delivery_fee" >= 0),
	CONSTRAINT "orders_total_amount_non_negative" CHECK ("orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "review_gallery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"alt_text" varchar(255) DEFAULT 'Avis client' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"author_name" varchar(255) DEFAULT 'Client' NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"status" "store_review_status" DEFAULT 'pending' NOT NULL,
	"show_in_general" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "store_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"email" varchar(255) DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"rating" smallint DEFAULT 5 NOT NULL,
	"status" "store_review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_reviews_rating_range" CHECK ("store_reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"primary_color" varchar(7) DEFAULT '#8D191C' NOT NULL,
	"secondary_color" varchar(7) DEFAULT '#F3EBEC' NOT NULL,
	"hero_left_image" text DEFAULT '/pictures/femme_example.jpg' NOT NULL,
	"hero_right_image" text DEFAULT '/pictures/enfant_example.jpg' NOT NULL,
	"delivery_fee" numeric(10, 3) DEFAULT '8.000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_id_check" CHECK ("site_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_exchange_id_order_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."order_exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_exchanges" ADD CONSTRAINT "order_exchanges_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_password_resets_user_id" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_password_resets_expires_at" ON "password_resets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_product_images_product_id" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_product_images_one_primary" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "idx_product_variants_product_id" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_products_category_id" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_is_featured" ON "products" USING btree ("is_featured") WHERE "products"."is_featured" = true;--> statement-breakpoint
CREATE INDEX "idx_products_is_active" ON "products" USING btree ("is_active") WHERE "products"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_cart_items_cart_id" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "idx_cart_items_variant_id" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_carts_user_id" ON "carts" USING btree ("user_id") WHERE "carts"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_carts_guest_session_id" ON "carts" USING btree ("guest_session_id") WHERE "carts"."guest_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_favourites_user_product" ON "favourites" USING btree ("user_id","product_id") WHERE "favourites"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_favourites_guest_product" ON "favourites" USING btree ("guest_session_id","product_id") WHERE "favourites"."guest_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_favourites_product_id" ON "favourites" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_favourites_guest_session_id" ON "favourites" USING btree ("guest_session_id") WHERE "favourites"."guest_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_exchange_items_exchange_id" ON "exchange_items" USING btree ("exchange_id");--> statement-breakpoint
CREATE INDEX "idx_exchange_items_variant_id" ON "exchange_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_order_email_deliveries_order_id" ON "order_email_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_exchanges_order_id" ON "order_exchanges" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_variant_id" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_user_id" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_guest_session_id" ON "orders" USING btree ("guest_session_id") WHERE "orders"."guest_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_orders_order_source" ON "orders" USING btree ("order_source");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reviews_product_id" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_user_id" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_is_approved" ON "reviews" USING btree ("is_approved") WHERE "reviews"."is_approved" = true;--> statement-breakpoint
CREATE INDEX "idx_reviews_show_in_general" ON "reviews" USING btree ("show_in_general") WHERE "reviews"."show_in_general" = true;--> statement-breakpoint
CREATE INDEX "idx_store_reviews_status" ON "store_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_reviews_created_at" ON "store_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contact_messages_created_at" ON "contact_messages" USING btree ("created_at");