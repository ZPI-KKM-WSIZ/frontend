'use strict';

const express = require('express');
const {createProxyMiddleware} = require('http-proxy-middleware');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://api.3492357.xyz';
const PORT = Number(process.env.PORT ?? 3000);
const SENSORS_PAGE_SIZE = Number(process.env.SENSORS_PAGE_SIZE ?? 1000);

// ---------------------------------------------------------------------------
// Sensor helpers
// ---------------------------------------------------------------------------

function buildFriendlyName(sensor, addressDto) {
    const uuidPrefix = String(sensor.id).split('-')[0];
    const city = addressDto?.city?.trim();
    const state = addressDto?.state?.trim();
    const country = addressDto?.country?.trim();
    if (city) {
        return `${city}-${uuidPrefix}`;
    }
    else if (state){
        return `${state}-${uuidPrefix}`;
    }
    else if (country){
        return `${country}-${uuidPrefix}`;
    }
    return uuidPrefix;
}


// ---------------------------------------------------------------------------
// Backend fetch helper
// ---------------------------------------------------------------------------

async function backendFetch(urlPath) {
    const fullUrl = `${BACKEND_URL}${urlPath}`;
    let res;
    try {
        res = await fetch(fullUrl);
    } catch (err) {
        console.error(`[backendFetch] Network error fetching ${fullUrl}:`, err.cause ?? err);
        throw err;
    }
    // Accept both 200 and 201 — the readings endpoint returns 201 on GET (backend bug)
    if (res.status !== 200 && res.status !== 201) {
        const body = await res.text().catch(() => '');
        throw new Error(`Backend HTTP ${res.status} for ${fullUrl} — ${body}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Per-sensor data fetchers (non-fatal — return null on failure)
// ---------------------------------------------------------------------------

async function fetchLatestReading(sensorId) {
    try {
        const readings = await backendFetch(
            `/api/v1/readings?sensor_id=${encodeURIComponent(sensorId)}&limit=1`
        );
        return Array.isArray(readings) && readings.length > 0 ? readings[0] : null;
    } catch (err) {
        console.warn(`[readings] sensor ${sensorId}:`, err.message);
        return null;
    }
}

async function fetchSensorLocation(sensorId) {
    try {
        return await backendFetch(
            `/api/v1/locations/by-sensor?sensor_id=${encodeURIComponent(sensorId)}`
        );
    } catch (err) {
        console.warn(`[location] sensor ${sensorId}:`, err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Shape builder
//
// Location model fields (from contracts):
//   id, localization_lat, localization_lon
//
// SensorReading fields:
//   id_sensor, id_location, created_at, token,
//   co2, tvoc, pm1, pm10, pm25, pressure, humidity, temperature
// ---------------------------------------------------------------------------

function buildStation(sensor, locationTuple, reading) {
    const location = Array.isArray(locationTuple) ? locationTuple[0] : locationTuple;
    const addressDto = Array.isArray(locationTuple) ? locationTuple[1] : locationTuple;
    const lat = location?.localization_lat ?? location?.lat ?? null;
    const lon = location?.localization_lon ?? location?.lon ?? location?.long ?? null;


    return {
        id: sensor.id,
        friendly_name: buildFriendlyName(sensor, addressDto),
        last_seen_at: reading?.created_at ?? null,
        sensors: {
            pm1: reading?.pm1 ?? null,
            pm25: reading?.pm25 ?? null,
            pm10: reading?.pm10 ?? null,
            temperature: reading?.temperature ?? null,
            humidity: reading?.humidity ?? null,
            pressure: reading?.pressure ?? null,
        },
        meta: {lat, lon},
    };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Aggregated stations endpoint
//
//  GET /api/v1/public/stations
//
//  1. GET /api/v1/sensors?page_size=N              → list of SensorBoards
//  2. Per sensor (parallel):
//     a. GET /api/v1/locations/by-sensor?sensor_id → Location (lat/lon)
//     b. GET /api/v1/readings?sensor_id&limit=1    → latest SensorReading
//  3. Merge into { stations: [...] }
// ---------------------------------------------------------------------------

app.get('/api/v1/public/stations', async (_req, res) => {
    try {
        const sensors = await backendFetch(
            `/api/v1/sensors?page_size=${SENSORS_PAGE_SIZE}`
        );

        if (!Array.isArray(sensors)) {
            console.error('[stations] Unexpected /sensors response:', sensors);
            return res.status(502).json({error: 'Unexpected response format from backend /sensors'});
        }

        const settled = await Promise.allSettled(
            sensors.map(async (sensor) => {
                const [location, reading] = await Promise.all([
                    fetchSensorLocation(sensor.id),
                    fetchLatestReading(sensor.id),
                ]);
                return buildStation(sensor, location, reading);
            })
        );

        const stations = settled
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value);

        res.json({stations});
    } catch (err) {
        console.error('[/api/v1/public/stations]', err.message);
        res.status(500).json({error: err.message});
    }
});

// ---------------------------------------------------------------------------
// Transparent proxy for all other /api/* calls to the backend
// ---------------------------------------------------------------------------

app.use(
    '/api',
    createProxyMiddleware({
        target: BACKEND_URL,
        changeOrigin: true,
        on: {
            error(err, _req, res) {
                console.error('[proxy]', err.message);
                res.status(502).json({error: `Proxy error: ${err.message}`});
            },
        },
    })
);

// SPA fallback
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
    console.log(`AQ Cloud frontend  →  http://0.0.0.0:${PORT}`);
    console.log(`Backend API proxy  →  ${BACKEND_URL}`);
});
