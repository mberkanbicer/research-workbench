#!/bin/bash
# Backup PostgreSQL database using pg_dump
# Usage: ./scripts/backup-db.sh [backup_dir]
#
# Requires: pg_dump (from postgresql-client)
# Database connection from environment or defaults:
#   DATABASE_URL or PGHOST/PGPORT/PGUSER/PGDATABASE

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/research_workbench_${TIMESTAMP}.sql.gz"

# Parse DATABASE_URL if set
if [ -n "${DATABASE_URL:-}" ]; then
  # Extract components from postgresql://user:pass@host:port/dbname
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')
  DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
  DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
else
  DB_HOST="${PGHOST:-localhost}"
  DB_PORT="${PGPORT:-5432}"
  DB_USER="${PGUSER:-research}"
  DB_NAME="${PGDATABASE:-research_workbench}"
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up ${DB_NAME} on ${DB_HOST}:${DB_PORT}..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip > "$BACKUP_FILE"

echo "Backup saved to: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t research_workbench_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
echo "Cleanup done. Recent backups:"
ls -lh research_workbench_*.sql.gz 2>/dev/null | head -5
