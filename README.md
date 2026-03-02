# Air Quality Cloud — Frontend

A lightweight Node.js/Express frontend server that aggregates air-quality sensor data from
the [AQ Cloud backend](https://api.3492357.xyz) and displays it on an interactive Leaflet map. Deployed as a Docker
container exposed publicly via a Cloudflare Tunnel.

---

## Features

- **Interactive map** — sensors rendered as colour-coded circle markers based on PM2.5 levels (Leaflet, OpenStreetMap /
  CartoDB dark tiles)
- **Live data** — auto-refreshes every 20 seconds from `/api/v1/public/stations`
- **Station search** — filter sensors by friendly name (city + UUID prefix)
- **Location search** — geocode any address with Nominatim autocomplete suggestions
- **GPS / My location** — centre the map on the user's current position
- **Detail panel** — PM1 · PM2.5 · PM10 · Temperature · Humidity · Pressure for the selected sensor
- **Light / Dark theme** — persisted in `localStorage`
- **Responsive** — full mobile layout with collapsible panels
- **Transparent API proxy** — all `/api/*` calls (except the aggregated endpoint) are forwarded to the backend

### PM2.5 colour bands

| Range (µg/m³) | Label     | Colour       |
|---------------|-----------|--------------|
| 0 – 12        | Very good | 🟢 `#14b86f` |
| 12.1 – 25     | Good      | 🟡 `#84cc16` |
| 25.1 – 35     | Moderate  | 🟠 `#eab308` |
| 35.1 – 55     | Poor      | 🔴 `#f97316` |
| > 55          | Very poor | 🔴 `#ef4444` |

---

## Architecture

```
Browser
  └── GET /                    → static SPA (public/)
  └── GET /api/v1/public/stations  ← aggregated by this server
  └── GET /api/*               → transparent proxy → backend API

AQ Cloud Backend API
  ├── GET /api/v1/sensors?page_size=N        (backend)
  ├── GET /api/v1/locations/by-sensor?…      (backend, per sensor)
  └── GET /api/v1/readings?sensor_id=…&limit=1  (backend, per sensor)
```

The aggregated `/api/v1/public/stations` response shape:

```json
{
  "stations": [
    {
      "id": "<uuid>",
      "friendly_name": "Kraków-3f5946e0",
      "last_seen_at": "2025-12-01T10:00:00Z",
      "sensors": {
        "pm1": 5,
        "pm25": 12,
        "pm10": 18,
        "temperature": 21.3,
        "humidity": 55,
        "pressure": 1013
      },
      "meta": {
        "lat": 50.06,
        "lon": 19.94
      }
    }
  ]
}
```

---

## Requirements

- **Docker** ≥ 20 + **Docker Compose** ≥ v2 (recommended)
- _or_ **Node.js** ≥ 18 (for running locally without Docker)
- A Cloudflare Tunnel token (for public HTTPS exposure)

---

## Quick Start — Docker (recommended)

1. **Clone the repository**

  ```bash
  git clone <repo-url>
  cd <repo-dir>
  ```

2. **Configure environment variables**

Copy the example and fill in your values:

  ```bash
  cp .env.example .env   # or edit .env directly
  ```

| Variable            | Default                   | Description                                    |
  |---------------------|---------------------------|------------------------------------------------|
| `BACKEND_URL`       | `https://api.3492357.xyz` | Base URL of the AQ Cloud backend API           |
| `PORT`              | `3000`                    | Internal port the Express server listens on    |
| `SENSORS_PAGE_SIZE` | `1000`                    | Max sensors fetched per `/api/v1/sensors` call |
| `TUNNEL_TOKEN`      | _(required)_              | Cloudflare Zero Trust tunnel token             |

3. **Start services**

  ```bash
  docker compose up -d
  ```

This starts two containers:

- **`aq-frontend`** — the Express server on internal port 3000
- **`aq-cloudflared`** — Cloudflare Tunnel that exposes the app publicly over HTTPS

4. **Check logs**

  ```bash
  docker compose logs -f app
  ```

---

## Local Development (without Docker)

```bash
cd local-server
npm install
npm run dev      # uses node --watch for auto-reload
```

The server starts at `http://localhost:3000` by default.  
Environment variables can be set in `local-server/.env`:

```env
BACKEND_URL=https://api.3492357.xyz
PORT=3000
SENSORS_PAGE_SIZE=1000
```

---

## Project Structure

```
.
├── Dockerfile                  # Production image (node:20-alpine)
├── docker-compose.yml          # app + cloudflared services
├── .env.example                # Template for .env
└── local-server/
    ├── server.js               # Express server — aggregation + proxy logic
    ├── package.json
    └── public/
        ├── index.html          # SPA shell (Polish UI)
        ├── app.js              # Leaflet map, data fetching, UI logic
        └── styles.css          # Responsive styles, light/dark themes
```

---

## API Endpoints (served by this server)

| Method | Path                      | Description                                          |
|--------|---------------------------|------------------------------------------------------|
| `GET`  | `/api/v1/public/stations` | Aggregated stations list (location + latest reading) |
| `*`    | `/api/*`                  | Transparent proxy to `BACKEND_URL`                   |
| `GET`  | `/*`                      | Static SPA files / SPA fallback (`index.html`)       |

---

## Related Repositories

| Repo      | URL                                       |
|-----------|-------------------------------------------|
| Backend   | https://github.com/ZPI-KKM-WSIZ/backend   |
| Database  | https://github.com/ZPI-KKM-WSIZ/database  |
| Contracts | https://github.com/ZPI-KKM-WSIZ/contracts |