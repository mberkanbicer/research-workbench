#!/bin/bash
# Cleanup old run events, model calls, and runs based on retention policy
# Usage: ./scripts/cleanup-old-data.sh [--days=90] [--dry-run]
#
# Default retention: 90 days
# Deletes: RunEvent, ModelCall, ContextManifest, RunStage for runs older than retention period

set -euo pipefail

DAYS="${1:-90}"
DRY_RUN=false

if [ "${2:-}" = "--dry-run" ] || [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  DAYS="${2:-90}"
fi

# Parse --days=N
if [[ "$DAYS" == --days=* ]]; then
  DAYS="${DAYS#--days=}"
fi

# Parse DATABASE_URL if set
if [ -n "${DATABASE_URL:-}" ]; then
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

CUTOFF_DATE=$(date -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -v-${DAYS}d +%Y-%m-%dT%H:%M:%S)

echo "Retention policy: ${DAYS} days"
echo "Cutoff date: ${CUTOFF_DATE}"
echo "Database: ${DB_NAME} on ${DB_HOST}:${DB_PORT}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would delete:"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT 'RunEvent' as table_name, COUNT(*) as count FROM \"RunEvent\" WHERE \"createdAt\" < '${CUTOFF_DATE}'
    UNION ALL
    SELECT 'ModelCall', COUNT(*) FROM \"ModelCall\" WHERE \"createdAt\" < '${CUTOFF_DATE}'
    UNION ALL
    SELECT 'ContextManifest', COUNT(*) FROM \"ContextManifest\" WHERE \"createdAt\" < '${CUTOFF_DATE}'
    UNION ALL
    SELECT 'RunStage', COUNT(*) FROM \"RunStage\" WHERE \"createdAt\" < '${CUTOFF_DATE}';
  "
else
  echo "Deleting old data..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    DELETE FROM \"RunEvent\" WHERE \"createdAt\" < '${CUTOFF_DATE}';
    DELETE FROM \"ModelCall\" WHERE \"createdAt\" < '${CUTOFF_DATE}';
    DELETE FROM \"ContextManifest\" WHERE \"createdAt\" < '${CUTOFF_DATE}';
    DELETE FROM \"RunStage\" WHERE \"createdAt\" < '${CUTOFF_DATE}';
  "
  echo "Cleanup complete."
fi
