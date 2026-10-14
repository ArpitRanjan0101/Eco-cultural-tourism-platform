-- Baseline: extensions and shared helpers used by every domain schema.

-- Spatial types, GiST indexes and distance queries (destinations, properties, nearby search).
CREATE EXTENSION IF NOT EXISTS postgis;
-- Case-insensitive text for normalised unique emails/codes.
CREATE EXTENSION IF NOT EXISTS citext;
-- Equality operators in GiST exclusion constraints (guide time-range overlap protection).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Keeps updated_at accurate on mutable business records.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
