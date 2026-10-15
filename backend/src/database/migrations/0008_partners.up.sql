-- Report 4.10: partners and verification (4 tables).

CREATE TABLE partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supply types a partner may manage (DECISIONS O5): accommodation, guide, operator (experiences + packages), multi.
  partner_type    TEXT NOT NULL CHECK (partner_type IN ('accommodation', 'guide', 'operator', 'multi')),
  business_name   TEXT NOT NULL CHECK (char_length(btrim(business_name)) BETWEEN 1 AND 200),
  legal_name      TEXT NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 1 AND 200),
  email           CITEXT NOT NULL CHECK (char_length(email) <= 254),
  phone           TEXT CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  address         TEXT CHECK (char_length(address) <= 500),
  tax_identifier  TEXT CHECK (tax_identifier ~ '^[A-Z0-9]{8,20}$'),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX partners_status_idx ON partners (status, created_at DESC);
CREATE INDEX partners_name_trgm ON partners USING GIN (business_name gin_trgm_ops);
CREATE TRIGGER partners_set_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Organisation membership; distinct from global roles (Report §4.15).
CREATE TABLE partner_users (
  partner_id  UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
CREATE INDEX partner_users_user_idx ON partner_users (user_id);

CREATE TABLE partner_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
  media_id       UUID NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  document_type  TEXT NOT NULL CHECK (document_type IN (
                   'business_registration', 'gst_certificate', 'pan_card', 'identity_proof',
                   'address_proof', 'tourism_license', 'other')),
  review_status  TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by    UUID REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, media_id)
);
CREATE INDEX partner_documents_partner_idx ON partner_documents (partner_id);

CREATE TABLE partner_approval_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
  previous_status  TEXT,
  new_status       TEXT NOT NULL,
  reviewed_by      UUID REFERENCES users (id) ON DELETE RESTRICT,
  notes            TEXT CHECK (char_length(notes) <= 2000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX partner_approval_history_partner_idx ON partner_approval_history (partner_id, created_at);
