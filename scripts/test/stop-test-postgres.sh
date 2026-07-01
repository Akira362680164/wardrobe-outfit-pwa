#!/usr/bin/env bash
set -euo pipefail

echo "PostgreSQL is a shared service. Do not stop if other sessions are using it."
echo "To stop: pg_ctl -D /usr/local/var/postgresql@16 stop"
