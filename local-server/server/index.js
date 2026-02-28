const path = require('path');
const express = require('express');
const store = require('./store');

const app = express();
const remoteBackendBase = (process.env.REMOTE_BACKEND_BASE || '').trim().replace(/\/+$/, '');
const useRemoteBackend = remoteBackendBase.length > 0;

function toRegisterPayload(upload) {
  const lat = Number(upload?.meta?.lat);
  const lon = Number(upload?.meta?.lon);

  return {
    status: 'active',
    location: {
      lat: Number.isFinite(lat) ? lat : 0,
      long: Number.isFinite(lon) ? lon : 0
    }
  };
}

function pickNumber(candidates) {
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function normalizeReadingsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.readings)) {
    return payload.readings;
  }

  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function toStationModel(reading, index) {
  const lat = pickNumber([reading?.lat, reading?.location?.lat, reading?.meta?.lat]);
  const lon = pickNumber([reading?.long, reading?.lon, reading?.location?.long, reading?.location?.lon, reading?.meta?.lon]);
  const timestamp = reading?.created_at || reading?.timestamp || reading?.createdAt || new Date().toISOString();

  return {
    id: reading?.id || reading?.sensor_id || reading?.id_sensor || `remote-${index + 1}`,
    friendly_name: reading?.friendly_name || reading?.name || reading?.sensor_name || `Station ${index + 1}`,
    last_seen_at: timestamp,
    meta: {
      lat,
      lon,
      indoor: Boolean(reading?.meta?.indoor)
    },
    sensors: {
      pm1: pickNumber([reading?.pm1, reading?.sensors?.pm1]),
      pm25: pickNumber([reading?.pm25, reading?.sensors?.pm25]),
      pm10: pickNumber([reading?.pm10, reading?.sensors?.pm10]),
      temperature: pickNumber([reading?.temperature, reading?.sensors?.temperature]),
      humidity: pickNumber([reading?.humidity, reading?.sensors?.humidity]),
      pressure: pickNumber([reading?.pressure, reading?.sensors?.pressure]),
      co2: pickNumber([reading?.co2, reading?.sensors?.co2]),
      tvoc: pickNumber([reading?.tvoc, reading?.sensors?.tvoc])
    },
    availability: {
      pm1: pickNumber([reading?.pm1, reading?.sensors?.pm1]) !== null,
      pm25: pickNumber([reading?.pm25, reading?.sensors?.pm25]) !== null,
      pm10: pickNumber([reading?.pm10, reading?.sensors?.pm10]) !== null,
      temperature: pickNumber([reading?.temperature, reading?.sensors?.temperature]) !== null,
      humidity: pickNumber([reading?.humidity, reading?.sensors?.humidity]) !== null,
      pressure: pickNumber([reading?.pressure, reading?.sensors?.pressure]) !== null,
      co2: pickNumber([reading?.co2, reading?.sensors?.co2]) !== null,
      tvoc: pickNumber([reading?.tvoc, reading?.sensors?.tvoc]) !== null
    },
    uptime: pickNumber([reading?.uptime])
  };
}

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/v1/device/upload', async (req, res) => {
  const upload = req.body;

  if (!upload || typeof upload !== 'object') {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  if (useRemoteBackend) {
    try {
      const response = await fetch(`${remoteBackendBase}/api/v1/sensors/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toRegisterPayload(upload))
      });

      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json(payload);
    } catch (error) {
      return res.status(502).json({
        error: 'remote_backend_unavailable',
        message: error.message
      });
    }
  }

  const result = store.ingestUpload(upload, req.ip || 'unknown');
  return res.status(result.status).json(result.body);
});

app.get('/api/v1/public/stations', async (_req, res) => {
  if (useRemoteBackend) {
    try {
      // Proxy directly to the FastAPI /api/v1/public/stations endpoint which
      // aggregates all sensors with their latest readings from Cassandra.
      const response = await fetch(`${remoteBackendBase}/api/v1/public/stations`);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'remote_stations_failed' });
      }

      const payload = await response.json().catch(() => ({ stations: [] }));
      return res.json(payload);
    } catch (error) {
      return res.status(502).json({
        error: 'remote_backend_unavailable',
        message: error.message
      });
    }
  }

  return res.json({
    stations: store.listStations()
  });
});

app.get('/api/v1/public/stations/:id/history', (req, res) => {
  const history = store.getStationHistory(req.params.id, req.query.limit);
  if (!history) {
    return res.status(404).json({ error: 'station_not_found' });
  }

  return res.json(history);
});

const webDir = path.join(__dirname, '..', 'web');
app.use(express.static(webDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Air Quality Cloud listening on http://localhost:${port}`);
});
