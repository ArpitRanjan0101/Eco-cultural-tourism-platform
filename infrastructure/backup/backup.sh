#!/bin/sh
# Logical backup of the application database (custom format, compressed).
# Runs in the postgres image (matching pg_dump version) via the `backup` compose service.
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_DIR (default /backups), BACKUP_RETENTION_DAYS (default 14).
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/${PGDATABASE}-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
umask 077

# Write to a temporary name first so a failed dump never looks like a complete backup.
pg_dump --format=custom --compress=6 --no-password --file="${FILE}.partial" "$PGDATABASE"
# A dump that pg_restore cannot list is unusable: verify before publishing it.
pg_restore --list "${FILE}.partial" > /dev/null
mv "${FILE}.partial" "$FILE"
sha256sum "$FILE" | sed "s#${BACKUP_DIR}/##" > "${FILE}.sha256"

echo "backup written: $(basename "$FILE") ($(wc -c < "$FILE") bytes)"

# Retention: remove complete backups (and checksums) older than RETENTION_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "${PGDATABASE}-*.dump" -o -name "${PGDATABASE}-*.dump.sha256" \) -mtime "+${RETENTION_DAYS}" -print -delete \
  | sed 's#^#pruned: #'
