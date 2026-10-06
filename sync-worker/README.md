# STEELER Logbook Sync Worker Prototype

This folder contains the isolated Cloudflare Worker prototype for the v1.2.0 data sync stream.

The browser app calls this Worker from Settings for cloud checks, manual sync preview, auto-sync, read-only backup listing, selected backup JSON download, and guarded cloud-backup restore.

Shared Worker URL:

```text
https://steeler-logbook-sync.bill-merry-52f.workers.dev
```

## Intended Shape

- Cloudflare Worker exposes a small private JSON API.
- D1 stores sync records as JSON payloads plus searchable metadata.
- The browser app remains offline-first and keeps using local storage.
- Manual STEELER data backup/restore remains the safety net.
- Authentication starts with one private bearer token.

## Endpoints

- `GET /health` is public and returns a simple health response.
- `GET /v1/status` requires auth and returns record/client counts.
- `GET /v1/records/summary?includeBackups=0&limit=500` requires auth and returns sync-record metadata only, without heavy payloads.
- `GET /v1/backups?limit=5` requires auth and returns recent cloud backup summaries only.
- `GET /v1/backups/{recordId}` requires auth and returns one complete backup JSON payload for download or guarded manual restore.
- `GET /v1/records?since=0&limit=100` requires auth and pulls changed records by server revision.
- `POST /v1/records/push` requires auth and upserts records.

Auth can use either:

- `Authorization: Bearer <token>`
- `X-STEELER-Sync-Token: <token>`

The token should be stored as a Worker secret named `SYNC_API_TOKEN`.

## Setup Notes

1. Create a D1 database for live.
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

This Worker stores complete STEELER data packages and recent recovery backups. The app decides whether to upload this device's full package or ask the user to choose between this device and the cloud copy.
