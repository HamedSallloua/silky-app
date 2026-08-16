-- Silky e-commerce PostgreSQL schema
-- Run: psql $DATABASE_URL -f server/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('customer', 'admin');

CREATE TYPE order_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'cancelled',
  'exchanged'
);

CREATE TYPE order_source AS ENUM (
  'web',
  'social_media',
  'instagram',
  'whatsapp',
  'phone'
);

CREATE TYPE store_review_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'customer',
  full_name     VARCHAR(255) NOT NULL,
  phone_number  VARCHAR(32) UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_resets_user_id ON password_resets (user_id);
CREATE INDEX idx_password_resets_expires_at ON password_resets (expires_at)
  WHERE used = FALSE;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                VARCHAR(255) NOT NULL,
  slug                 VARCHAR(255) NOT NULL UNIQUE,
  description          TEXT NOT NULL DEFAULT '',
  price                NUMERIC(10, 3) NOT NULL CHECK (price >= 0),
  discount_amount      NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  category_id          UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  collection_image_url TEXT,
  is_featured          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (discount_amount <= price)
);

CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_is_featured ON products (is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_is_active ON products (is_active) WHERE is_active = TRUE;

CREATE TABLE product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size            VARCHAR(16) NOT NULL,
  color_slug      VARCHAR(64) NOT NULL,
  color_name      VARCHAR(64) NOT NULL,
  color_image_url TEXT,
  stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  sku             VARCHAR(128) NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, size, color_slug)
);

CREATE INDEX idx_product_variants_product_id ON product_variants (product_id);

CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  color_slug VARCHAR(64),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product_id ON product_images (product_id);

-- Only one primary image per product
CREATE UNIQUE INDEX idx_product_images_one_primary
  ON product_images (product_id)
  WHERE is_primary = TRUE;

-- ---------------------------------------------------------------------------
-- Cart & favourites (authenticated + guest sessions)
-- ---------------------------------------------------------------------------

CREATE TABLE carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_session_id  UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_carts_user_id ON carts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_carts_guest_session_id ON carts (guest_session_id)
  WHERE guest_session_id IS NOT NULL;

CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, variant_id)
);

CREATE INDEX idx_cart_items_cart_id ON cart_items (cart_id);
CREATE INDEX idx_cart_items_variant_id ON cart_items (variant_id);

CREATE TABLE favourites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_session_id UUID,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_favourites_user_product
  ON favourites (user_id, product_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_favourites_guest_product
  ON favourites (guest_session_id, product_id)
  WHERE guest_session_id IS NOT NULL;

CREATE INDEX idx_favourites_product_id ON favourites (product_id);
CREATE INDEX idx_favourites_guest_session_id ON favourites (guest_session_id)
  WHERE guest_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      VARCHAR(32) NOT NULL UNIQUE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_session_id  UUID,
  customer_name     VARCHAR(255) NOT NULL,
  customer_email    VARCHAR(255),
  customer_phone    VARCHAR(32) NOT NULL,
  shipping_address  TEXT NOT NULL,
  subtotal          NUMERIC(10, 3) NOT NULL CHECK (subtotal >= 0),
  delivery_fee      NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount      NUMERIC(10, 3) NOT NULL CHECK (total_amount >= 0),
  order_source      order_source NOT NULL DEFAULT 'web',
  status            order_status NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_guest_session_id ON orders (guest_session_id)
  WHERE guest_session_id IS NOT NULL;
CREATE INDEX idx_orders_order_source ON orders (order_source);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);

CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_title  VARCHAR(255) NOT NULL,
  variant_label  VARCHAR(255),
  image_url      TEXT,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10, 3) NOT NULL CHECK (unit_price >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_variant_id ON order_items (variant_id);

CREATE TABLE order_exchanges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  exchange_number   VARCHAR(64) NOT NULL UNIQUE,
  exchange_sequence INTEGER NOT NULL DEFAULT 1,
  customer_name     VARCHAR(255) NOT NULL,
  customer_email    VARCHAR(255),
  customer_phone    VARCHAR(32) NOT NULL,
  shipping_address  TEXT NOT NULL,
  subtotal          NUMERIC(10, 3) NOT NULL CHECK (subtotal >= 0),
  delivery_fee      NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount      NUMERIC(10, 3) NOT NULL CHECK (total_amount >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_exchanges_order_id ON order_exchanges (order_id);

CREATE TABLE exchange_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id    UUID NOT NULL REFERENCES order_exchanges(id) ON DELETE CASCADE,
  variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_title  VARCHAR(255) NOT NULL,
  variant_label  VARCHAR(255),
  image_url      TEXT,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10, 3) NOT NULL CHECK (unit_price >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_items_exchange_id ON exchange_items (exchange_id);
CREATE INDEX idx_exchange_items_variant_id ON exchange_items (variant_id);

CREATE TABLE order_email_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  email_type    VARCHAR(64) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  CONSTRAINT uq_order_email_deliveries_order_type UNIQUE (order_id, email_type)
);

CREATE INDEX idx_order_email_deliveries_order_id ON order_email_deliveries (order_id);

-- ---------------------------------------------------------------------------
-- Product reviews (per product)
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  author_name     VARCHAR(255) NOT NULL DEFAULT 'Client',
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT NOT NULL,
  is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  status          store_review_status NOT NULL DEFAULT 'pending',
  show_in_general BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_product_id ON reviews (product_id);
CREATE INDEX idx_reviews_user_id ON reviews (user_id);
CREATE INDEX idx_reviews_is_approved ON reviews (is_approved) WHERE is_approved = TRUE;
CREATE INDEX idx_reviews_show_in_general ON reviews (show_in_general) WHERE show_in_general = TRUE;

-- General store reviews (matches current /api/reviews flow — not tied to a product)
CREATE TABLE store_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  rating      SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status      store_review_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_store_reviews_status ON store_reviews (status);
CREATE INDEX idx_store_reviews_created_at ON store_reviews (created_at DESC);

-- Customer photo gallery shown alongside published reviews
CREATE TABLE review_gallery (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url  TEXT NOT NULL,
  alt_text   VARCHAR(255) NOT NULL DEFAULT 'Avis client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Contact messages submitted via Contact Us page
-- ---------------------------------------------------------------------------

CREATE TABLE contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name  VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  message    TEXT NOT NULL,
  status     VARCHAR(32) NOT NULL DEFAULT 'pending',
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_messages_created_at ON contact_messages (created_at DESC);


-- ---------------------------------------------------------------------------
-- Site theme (replaces theme.json)
-- ---------------------------------------------------------------------------

CREATE TABLE site_settings (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  primary_color     CHAR(7) NOT NULL DEFAULT '#8D191C',
  secondary_color   CHAR(7) NOT NULL DEFAULT '#F3EBEC',
  hero_left_image   TEXT NOT NULL DEFAULT '/pictures/femme_example.jpg',
  hero_right_image  TEXT NOT NULL DEFAULT '/pictures/enfant_example.jpg',
  delivery_fee      NUMERIC(10, 3) NOT NULL DEFAULT 8.000,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_store_reviews_updated_at
  BEFORE UPDATE ON store_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
