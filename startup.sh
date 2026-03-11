#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  IAMOneStop — Azure App Service startup script
#  Configured as the "Startup Command" in the App Service Configuration.
#
#  Runs every time the container/dyno starts:
#    1. Ensures the SQLite data directory exists on persistent storage
#    2. Syncs the Prisma schema (creates any missing tables — safe to re-run)
#    3. Starts the Next.js production server
# ──────────────────────────────────────────────────────────────────────────────

set -e   # exit immediately on any error

echo "================================================"
echo " IAMOneStop — startup"
echo " Node:    $(node --version)"
echo " NPM:     $(npm --version)"
echo " Env:     ${ENVIRONMENT:-production}"
echo "================================================"

# ── 1. Persistent storage directory for SQLite ───────────────────────────────
# Azure App Service Linux mounts /home as persistent storage across restarts.
# The DB file lives at /home/data/app.db (set DATABASE_URL accordingly).
DATA_DIR="/home/data"
if [ ! -d "$DATA_DIR" ]; then
  echo "[startup] Creating data directory: $DATA_DIR"
  mkdir -p "$DATA_DIR"
fi

# ── 2. Prisma DB sync ─────────────────────────────────────────────────────────
# db push applies any schema changes without data loss.
# --skip-generate avoids re-generating the client at startup (already in node_modules).
echo "[startup] Syncing database schema..."
npx prisma db push --skip-generate
echo "[startup] Database schema up to date."

# ── 3. Start the application ──────────────────────────────────────────────────
# Azure App Service sets the PORT environment variable (typically 8080).
# next start respects PORT automatically.
echo "[startup] Starting Next.js on port ${PORT:-3000}..."
exec npm start
