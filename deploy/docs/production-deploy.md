# Wardrobe Cloud 1A Production Deploy Notes

This document covers the production API, PostgreSQL, and server-local asset storage layout.

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
/srv/wardrobe/storage/
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

Asset files are stored under the host directory `/srv/wardrobe/storage`, mounted at `/var/lib/wardrobe-api/storage` in the API container. Create the host directory before deployment, keep it writable only by the service administrator, and include it in file-level backups alongside PostgreSQL backups. `ASSET_MAX_BYTES` defaults to `15728640` bytes (15 MiB).

`ALLOWED_ORIGINS` is a comma-separated CORS allowlist. For production, include the filed web origin, local development origins, and Capacitor:

```text
https://zhengfangapps.cloud,http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost
```

## Email Verification

Production email verification uses Tencent SES. Store these values only in
`/opt/wardrobe-cloud/.env`; do not commit them or print the file contents:

```text
AUTH_HMAC_SECRET=<at-least-32-random-bytes>
EMAIL_PROVIDER=tencent-ses
TENCENTCLOUD_SECRET_ID=<secret-id>
TENCENTCLOUD_SECRET_KEY=<secret-key>
TENCENT_SES_REGION=ap-hongkong
TENCENT_SES_ENDPOINT=ses.tencentcloudapi.com
TENCENT_SES_FROM=Wardora <no-reply@mail.zhengfangapps.cloud>
TENCENT_SES_REPLY_TO=
TENCENT_SES_VERIFY_TEMPLATE_ID=<approved-template-id>
```

`AUTH_HMAC_SECRET` is the single production HMAC secret used for email codes,
WeChat identities, and binding tickets. Generate it once before enabling the
new auth routes and retain it across deployments. Rotating it invalidates
unconsumed email codes and outstanding binding tickets.

Wardora's verified sender domain, sender address, and template are provisioned
in Tencent SES region `ap-hongkong`. Keep the API region aligned with those
resources; using another supported SES region still makes the template and
sender unavailable to the request.

After the template is approved, back up PostgreSQL, build the new API image,
and start it with the complete configuration. Activation is successful only
when `/api/ready` reports `dependencies.email: "ready"`. Then send one
controlled registration code to the designated test inbox before testing
password reset, password change, and WeChat binding. Do not use the production
`log` provider as a delivery fallback.

## Caddy

The server already has Caddy at `/usr/bin/caddy`. Do not reinstall, downgrade, or clear `/var/lib/caddy`.

Recommended flow:

```bash
deploy/scripts/wardrobe-cloud.sh audit-caddy
deploy/scripts/wardrobe-cloud.sh apply-caddy
```

`apply-caddy` backs up `/etc/caddy/Caddyfile`, validates the candidate config, then reloads Caddy.

Use the filed HTTPS API endpoint:

```bash
HEALTH_BASE_URL=https://api.zhengfangapps.cloud deploy/scripts/wardrobe-cloud.sh health
```

## API Endpoint Switch Points

The app must not hard-code server IP addresses in source code. Keep the endpoint modular through these knobs:

| Layer | Production value |
| --- | --- |
| Frontend / Android build API base | `NEXT_PUBLIC_WARDROBE_API_BASE_URL=https://api.zhengfangapps.cloud` |
| API CORS allowlist | `ALLOWED_ORIGINS=https://zhengfangapps.cloud,http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost` |
| Health checks | `HEALTH_BASE_URL=https://api.zhengfangapps.cloud` |
| Caddy public entry | HTTPS site block for `api.zhengfangapps.cloud` |

Rebuild the frontend/APK after changing `NEXT_PUBLIC_WARDROBE_API_BASE_URL`. Do not add account-specific endpoint branching in React components or business modules.

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

The API runs pending Drizzle migrations before listening. Always run
`backup-db` before deploying an image that contains new migrations. If startup
or readiness fails, keep the database backup and previous image; do not attempt
to reverse migration SQL automatically.

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
