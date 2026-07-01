#!/usr/bin/env bash
set -euo pipefail

echo "PostgreSQL status:"
pg_isready || echo "Not running. Start with: pg_ctl -D /usr/local/var/postgresql@16 start"
echo "Using local PostgreSQL at /tmp"
