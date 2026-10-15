#!/bin/sh
# Compares a restored database with its source: verify-restore.sh <source_db> <restored_db>
# Checks every table's row count, the applied migrations and the media references.
# Only meaningful when the source has not changed since the backup (a drill or a quiesced system).
# Env: PGHOST PGUSER PGPASSWORD.
set -eu

SOURCE="${1:?usage: verify-restore.sh <source_db> <restored_db>}"
RESTORED="${2:?usage: verify-restore.sh <source_db> <restored_db>}"

COUNTS="SELECT table_name || ' ' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text
        FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
MIGRATIONS="SELECT version || ' ' || checksum FROM schema_migrations ORDER BY version"
MEDIA="SELECT status || ' ' || visibility || ' ' || count(*) FROM media_assets GROUP BY status, visibility ORDER BY 1"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
for check in COUNTS MIGRATIONS MEDIA; do
  eval "sql=\$$check"
  psql --no-password -d "$SOURCE" -tAc "$sql" > "$tmp/source"
  psql --no-password -d "$RESTORED" -tAc "$sql" > "$tmp/restored"
  if diff -u "$tmp/source" "$tmp/restored" > "$tmp/diff"; then
    echo "ok   $check ($(wc -l < "$tmp/source") line(s) identical)"
  else
    echo "FAIL $check"; cat "$tmp/diff"; fail=1
  fi
done
exit "$fail"
