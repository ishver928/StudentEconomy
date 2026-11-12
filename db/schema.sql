-- StudentEconomy schema. Idempotent and non-destructive: safe to re-run on the shared database.
-- Money is stored in integer cents. Sample/demo rows carry is_sample = true.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  first_name      TEXT,
  school          TEXT,
  education_level TEXT CHECK (education_level IN ('community_college', 'undergraduate', 'graduate', 'doctoral')),
  is_sample       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seller_id   TEXT REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL,
  condition   TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  school      TEXT,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  is_sample   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT REFERENCES users(id),
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'club', 'travel')),
  target_cents INTEGER NOT NULL CHECK (target_cents > 0),
  saved_cents  INTEGER NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
  is_sample    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT NOT NULL,
  club_name    TEXT NOT NULL,
  school       TEXT,
  description  TEXT,
  location     TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  goal_id      TEXT REFERENCES goals(id),
  is_sample    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A purchase (listing) or a contribution (goal). Only written after PayPal capture is COMPLETED.
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind             TEXT NOT NULL CHECK (kind IN ('purchase', 'contribution')),
  buyer_id         TEXT REFERENCES users(id),
  listing_id       TEXT REFERENCES listings(id),
  goal_id          TEXT REFERENCES goals(id),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'USD',
  paypal_order_id  TEXT UNIQUE,
  paypal_capture_id TEXT UNIQUE,
  status           TEXT NOT NULL DEFAULT 'COMPLETED',
  is_sample        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT REFERENCES users(id),
  category     TEXT NOT NULL,
  description  TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  spent_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  is_sample    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  rate_cents  INTEGER CHECK (rate_cents >= 0),
  is_sample   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opt-in community profiles; only rows with opt_in = true are shown publicly.
CREATE TABLE IF NOT EXISTS profiles (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT UNIQUE REFERENCES users(id),
  display_name    TEXT NOT NULL,
  school          TEXT,
  education_level TEXT,
  major           TEXT,
  bio             TEXT,
  interests       TEXT[] NOT NULL DEFAULT '{}',
  opt_in          BOOLEAN NOT NULL DEFAULT false,
  is_sample       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status);
CREATE INDEX IF NOT EXISTS expenses_user_idx ON expenses (user_id);
