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

-- ---- Phase 2: marketplace checkout (additive only) ----------------------------------

ALTER TABLE listings ADD COLUMN IF NOT EXISTS pickup_method TEXT;

-- Fill pickup methods for sample listings only, and only where still missing.
UPDATE listings
SET pickup_method = (ARRAY['campus_pickup', 'meetup', 'dorm_dropoff'])[1 + abs(hashtext(id)) % 3]
WHERE is_sample AND pickup_method IS NULL;

-- One row per checkout attempt. Not a purchase: purchases live in `orders` and are only written
-- after PayPal reports the capture as COMPLETED.
CREATE TABLE IF NOT EXISTS pending_checkouts (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  buyer_id          TEXT NOT NULL REFERENCES users(id),
  listing_id        TEXT NOT NULL REFERENCES listings(id),
  amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  paypal_order_id   TEXT UNIQUE,
  paypal_capture_id TEXT UNIQUE,
  approve_url       TEXT,
  status            TEXT NOT NULL DEFAULT 'creating' CHECK (status IN (
                      'creating', 'pending', 'cancelled', 'failed', 'abandoned', 'unavailable', 'declined',
                      'capture_pending', 'capture_unrecorded', 'completed', 'needs_review')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one open checkout per buyer and listing, so a double-click reuses the same attempt.
CREATE UNIQUE INDEX IF NOT EXISTS pending_checkouts_open_uniq
  ON pending_checkouts (buyer_id, listing_id) WHERE status IN ('creating', 'pending');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_id_uniq ON orders (checkout_id);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders (buyer_id);

-- ---- Phase 3: funding goals + contributions (additive only) ----------------------------

ALTER TABLE goals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline DATE;

-- One row per contribution attempt. Goal progress (goals.saved_cents) only moves when a
-- contribution order is recorded after PayPal reports the capture as COMPLETED.
CREATE TABLE IF NOT EXISTS goal_checkouts (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  buyer_id          TEXT NOT NULL REFERENCES users(id),
  goal_id           TEXT NOT NULL REFERENCES goals(id),
  amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  paypal_order_id   TEXT UNIQUE,
  paypal_capture_id TEXT UNIQUE,
  approve_url       TEXT,
  status            TEXT NOT NULL DEFAULT 'creating' CHECK (status IN (
                      'creating', 'pending', 'cancelled', 'failed', 'abandoned', 'declined',
                      'capture_pending', 'capture_unrecorded', 'completed', 'needs_review')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS goal_checkouts_open_uniq
  ON goal_checkouts (buyer_id, goal_id) WHERE status IN ('creating', 'pending');

-- ---- Phase 4: club events, travel planning, connections (additive only) ------------------
-- Identity is a demo browser cookie (no real authentication). User ids act as bearer secrets, so
-- pages never send another student's user id to the browser.

ALTER TABLE events ADD COLUMN IF NOT EXISTS creator_id TEXT REFERENCES users(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS budget_cents INTEGER CHECK (budget_cents >= 0);
ALTER TABLE events ADD COLUMN IF NOT EXISTS funding_purpose TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ; -- soft delete: linked goals and orders stay intact
CREATE INDEX IF NOT EXISTS events_starts_idx ON events (starts_at);

-- Fill categories for sample events only, where still missing.
UPDATE events SET category = 'Fundraiser' WHERE is_sample AND category IS NULL AND id = 'sample-event-1';
UPDATE events SET category = 'Hackathon' WHERE is_sample AND category IS NULL AND id = 'sample-event-2';

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   TEXT NOT NULL REFERENCES events(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('interested', 'going')),
  is_sample  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- A student's trip. The starting point is stored only as an approximate area: a coarse label
-- (city/neighborhood) and coordinates rounded to ~2 km. The exact address is never saved.
CREATE TABLE IF NOT EXISTS travel_plans (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT NOT NULL REFERENCES users(id),
  origin_area    TEXT NOT NULL,
  origin_lat     DOUBLE PRECISION NOT NULL,
  origin_lng     DOUBLE PRECISION NOT NULL,
  dest_label     TEXT NOT NULL,
  dest_lat       DOUBLE PRECISION NOT NULL,
  dest_lng       DOUBLE PRECISION NOT NULL,
  depart_date    DATE NOT NULL,
  depart_window  TEXT NOT NULL DEFAULT 'flexible' CHECK (depart_window IN ('morning', 'afternoon', 'evening', 'flexible')),
  return_date    DATE,
  budget_cents   INTEGER CHECK (budget_cents >= 0),
  est_cost_cents INTEGER CHECK (est_cost_cents >= 0),
  travel_mode    TEXT NOT NULL DEFAULT 'either' CHECK (travel_mode IN ('carpool', 'transit', 'either')),
  match_opt_in   BOOLEAN NOT NULL DEFAULT false,
  event_id       TEXT REFERENCES events(id),
  goal_id        TEXT REFERENCES goals(id),
  is_sample      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS travel_plans_user_idx ON travel_plans (user_id);
CREATE INDEX IF NOT EXISTS travel_plans_date_idx ON travel_plans (depart_date);

-- Connection requests between two travel plans; chat opens only once accepted.
CREATE TABLE IF NOT EXISTS connections (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_user    TEXT NOT NULL REFERENCES users(id),
  to_user      TEXT NOT NULL REFERENCES users(id),
  from_plan_id TEXT REFERENCES travel_plans(id),
  to_plan_id   TEXT REFERENCES travel_plans(id),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_uniq ON connections (LEAST(from_user, to_user), GREATEST(from_user, to_user));

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  sender_id     TEXT NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_connection_idx ON messages (connection_id, created_at);

-- Carpool planning only: no booking, driver vetting, or payments.
CREATE TABLE IF NOT EXISTS carpool_groups (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_id          TEXT NOT NULL REFERENCES users(id),
  plan_id           TEXT REFERENCES travel_plans(id),
  title             TEXT NOT NULL,
  seats             INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 7),
  shared_cost_cents INTEGER NOT NULL CHECK (shared_cost_cents BETWEEN 0 AND 500000),
  is_sample         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS carpool_members (
  group_id   TEXT NOT NULL REFERENCES carpool_groups(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
