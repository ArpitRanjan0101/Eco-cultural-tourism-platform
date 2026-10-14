-- Extensions are intentionally left installed: the PostGIS image pre-installs
-- postgis (plus dependents such as postgis_tiger_geocoder) in the main database,
-- and dropping them is a DBA action, not an application rollback.
DROP FUNCTION IF EXISTS set_updated_at();
