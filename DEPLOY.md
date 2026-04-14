# Lumina Deployment

Lumina no longer runs its own PostgreSQL container.

Current model:
- Nami billing and entitlements live in the `namibarden` database
- Lumina app data lives in the `lumina` schema inside that same database
- The Lumina app container joins the shared `namibarden-internal` Docker network and connects to `namibarden-db`

## Deploy order

1. Apply Nami DB migrations:
   - `migration-lumina-billing.sql`
   - `migration-lumina-app-schema.sql`
2. Recreate Nami so the fixed Docker network name is in place.
3. Deploy Lumina with:
   - `DB_HOST=namibarden-db`
   - `DB_NAME=namibarden`
   - `DB_USER=namibarden`
   - `DB_PASSWORD=<same password as Nami DB>`
   - `DB_SCHEMA=lumina`
   - `NAMI_LUMINA_BRIDGE_SECRET=<shared bridge secret>`
4. Rebuild Lumina: `docker compose up --build -d`

## Notes

- `LUMINA_ENABLE_TEST_USER` should stay `0` in production.
- Lumina still has its own app container; only the database layer is shared now.
