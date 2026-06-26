# Wardrobe Cloud 1A Production Deploy Notes

This document covers only the stage 1A deployment shell around the API. It does not enable wardrobe sync, COS assets, or account workspace switching.

## Server Layout

Use the fixed production directory:

```text
/opt/wardrobe-cloud/
  compose.production.yaml
  .env
  source/
    services/wardrobe-api/Dockerfile
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

`ALLOWED_ORIGINS` is a comma-separated CORS allowlist. For the temporary IP drill, include:

```text
http://111.231.98.86,http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost
```

## Caddy

The server already has Caddy at `/usr/bin/caddy`. Do not reinstall, downgrade, or clear `/var/lib/caddy`.

Recommended flow:

```bash
deploy/scripts/wardrobe-cloud.sh audit-caddy
deploy/scripts/wardrobe-cloud.sh apply-caddy
```

`apply-caddy` backs up `/etc/caddy/Caddyfile`, validates the candidate config, then reloads Caddy.

Before `zhengfangapps.cloud` completes ICP filing, use the temporary HTTP IP endpoint:

```bash
HEALTH_BASE_URL=http://111.231.98.86 deploy/scripts/wardrobe-cloud.sh health
```

The temporary IP endpoint is only for stage 1A testing. Do not treat it as the final production URL.

## External TLS Troubleshooting

If server-local `http://127.0.0.1:3000/api/health` works but public `https://api.zhengfangapps.cloud/api/health` fails during TLS handshake, check Caddy ACME logs before retrying:

```bash
journalctl -u caddy --since "20 minutes ago" --no-pager
```

For the 2026-06-26 A6 drill, Caddy was active and the API was healthy internally, but ACME failed because Let's Encrypt HTTP-01 reached a DNSPod webblock page for `api.zhengfangapps.cloud`, and TLS-ALPN-01 reported `111.231.98.86: Connection reset by peer`. Repeated retries then hit the Let's Encrypt failed-authorization rate limit. In this state, do not keep reloading Caddy. Fix the domain/DNS/ICP/webblock path first, or switch to a DNS-01 flow with explicit DNS credentials.

## Deploy

`WARDROBE_API_IMAGE` must point to a built API image. The stage 1A deployment script can build the local server image from `/opt/wardrobe-cloud/source`:

```bash
deploy/scripts/wardrobe-cloud.sh build-image
deploy/scripts/wardrobe-cloud.sh compose config
deploy/scripts/wardrobe-cloud.sh deploy
deploy/scripts/wardrobe-cloud.sh health
```

`deploy` pulls the `postgres` base image only. The API image is expected to exist locally from `build-image`, or to point to a reachable registry image if you override `WARDROBE_API_IMAGE`.

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
