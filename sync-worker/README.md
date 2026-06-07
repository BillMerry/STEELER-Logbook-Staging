# STEELER Logbook Sync Worker Prototype

This folder contains the isolated Cloudflare Worker prototype for the v1.2.0 data sync stream.

The browser app does not call this Worker yet. This is deliberately separate so the API, D1 schema, and authentication shape can be tested before any live logbook data is pushed or pulled.

## Intended Shape

- Cloudflare Worker exposes a small private JSON API.
- D1 stores sync records as JSON payloads plus searchable metadata.
- The browser app remains offline-first and keeps using local storage.
- Manual STEELER data backup/restore remains the safety net.
- Authentication starts with one private bearer token.

## Endpoints

- `GET /health` is public and returns a simple health response.
- `GET /v1/status` requires auth and returns record/client counts.
- `GET /v1/records?since=0&limit=100` requires auth and pulls changed records by server revision.
- `POST /v1/records/push` requires auth and upserts records.

Auth can use either:

- `Authorization: Bearer <token>`
- `X-STEELER-Sync-Token: <token>`

The token should be stored as a Worker secret named `SYNC_API_TOKEN`.

## Setup Notes

1. Create a D1 database for staging.
2. Replace `database_id` in `wrangler.toml`.
3. Set the token:

   ```sh
   wrangler secret put SYNC_API_TOKEN
   ```

4. Apply migrations:

   ```sh
   npm run d1:migrate:remote
   ```

5. Deploy:

   ```sh
   npm run deploy
   ```

## Important

This prototype is not yet connected to the STEELER browser app. Do not treat the Worker as a production sync authority until the next stages add conflict handling, client-side push/pull, and multi-device testing.
