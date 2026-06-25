# Wardrobe Cloud 1A Production Deploy Notes

This document covers only the stage 1A deployment shell around the API. It does not enable wardrobe sync, COS assets, or account workspace switching.

## Server Layout

Use the fixed production directory:

```text
/opt/wardrobe-cloud/
  compose.production.yaml
  .env
  caddy/Caddyfile
  secrets/
    jwt-private.pem
    jwt-public.pem
    refresh-idempotency.key
  backups/
```

Do not print `.env` or secret file contents in logs.

## Compose

All production Docker commands use:

```bash
docker compose \
  --project-name wardrobe-cloud \
  --env-file /opt/wardrobe-cloud/.env \
  -f /opt/wardrobe-cloud/compose.production.yaml \
  <command>
```

`postgres` is internal only. `wardrobe-api` binds to `127.0.0.1:3000:3000` for Caddy.

## Caddy

The server already has Caddy at `/usr/bin/caddy`. Do not reinstall, downgrade, or clear `/var/lib/caddy`.

Recommended flow:

```bash
deploy/scripts/wardrobe-cloud.sh audit-caddy
deploy/scripts/wardrobe-cloud.sh apply-caddy
```

`apply-caddy` backs up `/etc/caddy/Caddyfile`, validates the candidate config, then reloads Caddy.

## Deploy

`WARDROBE_API_IMAGE` must point to a prebuilt API image. Stage 1A Worker A does not create the image build pipeline.

```bash
deploy/scripts/wardrobe-cloud.sh compose config
deploy/scripts/wardrobe-cloud.sh deploy
deploy/scripts/wardrobe-cloud.sh health
```

## Backup And Restore Drill

Create a database dump:

```bash
deploy/scripts/wardrobe-cloud.sh backup-db
```

Restore drill uses a separate database, default `wardrobe_restore_test`:

```bash
deploy/scripts/wardrobe-cloud.sh restore-db-drill /opt/wardrobe-cloud/backups/postgres/<dump>.sql
```

Never restore a drill dump over the production database.

## Rollback

Rollback only changes the API image. Migrations are not rolled back.

```bash
deploy/scripts/wardrobe-cloud.sh rollback-image <previous-image>
deploy/scripts/wardrobe-cloud.sh health
```

## Local Checks

```bash
bash -n deploy/scripts/wardrobe-cloud.sh
docker compose --env-file deploy/.env.production.example -f deploy/compose.production.yaml config
docker compose -f deploy/compose.test.yaml config
```

If Docker or Compose is unavailable locally, run the compose checks on the server or another machine with Compose v2.
