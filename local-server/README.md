# Air Quality Local Server (backend + map frontend)

This is a **local development stack** separated from the target backend repositories in `cloud/_archive/`.
It is separate from Arduino firmware (`src/`, `include/`, `lib/`, `test/`).

## What it contains

- `web/` — map frontend,
- `server/` — Express backend (upload API and public endpoints),
- `data/db.json` — local database file created automatically at startup.

## Quick start

Requirements: Node.js 18+.

```bash
cd cloud/local-server
npm install
npm start
```

Application starts at `http://localhost:8080`.

## How to test the frontend

1. run `npm start`,
2. open `http://localhost:8080`,
3. verify map, PM2.5 legend, station list, and details panel,
4. optionally simulate upload with sample JSON to the device endpoint.

## Endpoints

### Device upload

`POST /api/v1/device/upload`

Body should follow project payload format (token/availability/meta/sensors).

Example onboarding response:

```json
{
  "token": "abc123-device-token"
}
```

For later uploads, backend may return an empty object `{}`.

### Public frontend data

- `GET /api/v1/public/stations`
- `GET /api/v1/public/stations/:id/history?limit=100`

## Firmware integration

In firmware set:

- `Config.serverUrl` -> `http://<your-server>:8080/api/v1/device/upload`
- `Config.uploadToken` -> empty at start (backend returns token)

After first successful upload, firmware stores the token from the response and reuses it.

## Optional configuration

- `PORT` (default: `8080`)
- `DATA_FILE` (default: `cloud/local-server/data/db.json`)
- `MAX_HISTORY` (default: `500` records per station)
- `REMOTE_BACKEND_BASE` (e.g. `http://api.3492357.xyz`) — when set, local server proxies to the target backend

## Target backend mode

If you want local frontend server to read data from the target backend (FastAPI + Cassandra):

```bash
cd cloud/local-server
REMOTE_BACKEND_BASE=http://api.3492357.xyz npm start
```

In this mode:

- `GET /api/v1/public/stations` → proxy to `GET <REMOTE_BACKEND_BASE>/api/v1/public/stations`
- `POST /api/v1/device/upload` → proxy to `POST <REMOTE_BACKEND_BASE>/api/v1/sensors/register`

