#!/bin/sh
# Restores a backup into a NEW database: restore.sh <file.dump> <target_database>
# Restoring over the live database is refused; switch the application over by changing
# POSTGRES_DB / DATABASE_URL after verify-restore.sh passes (see docs/operations/DEPLOYMENT.md).
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE (the live database, used for the safety check), BACKUP_DIR.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DUMP="${1:?usage: restore.sh <file.dump> <target_database>}"
TARGET="${2:?usage: restore.sh <file.dump> <target_database>}"
case "$DUMP" in /*) ;; *) DUMP="${BACKUP_DIR}/${DUMP}" ;; esac

if [ "$TARGET" = "$PGDATABASE" ]; then
  echo "refusing to restore over the live database '$PGDATABASE'; choose a new target name" >&2
  exit 1
fi
if ! printf '%s' "$TARGET" | grep -Eq '^[a-z_][a-z0-9_]{0,62}$'; then
  echo "target database name must be a lowercase identifier" >&2
  exit 1
fi
if [ -f "${DUMP}.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" > /dev/null) || { echo "checksum mismatch for $DUMP" >&2; exit 1; }
fi
if [ "$(psql --no-password -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${TARGET}'")" = "1" ]; then
  echo "database '$TARGET' already exists; drop it or choose another name" >&2
  exit 1
fi

createdb --no-password "$TARGET"
# Single transaction: either the whole backup is restored or nothing is.
pg_restore --no-password --exit-on-error --single-transaction --dbname="$TARGET" "$DUMP"
echo "restored $(basename "$DUMP") into database '$TARGET'"
