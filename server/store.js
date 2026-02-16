const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

function ensureDataFile() {
  const dir = path.dirname(dataFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    const initial = {
      nextDeviceId: 1,
      devices: []
    };
    fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDataFile();
  const raw = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2), 'utf8');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeUpload(payload) {
  const availability = payload?.availability && typeof payload.availability === 'object'
    ? payload.availability
    : {};

  const sensors = payload?.sensors && typeof payload.sensors === 'object'
    ? payload.sensors
    : {};

  const meta = payload?.meta && typeof payload.meta === 'object'
    ? payload.meta
    : {};

  const record = {
    timestamp: new Date().toISOString(),
    uptime: Number.isFinite(payload?.uptime) ? Number(payload.uptime) : null,
    availability: {
      co2: Boolean(availability.co2),
      tvoc: Boolean(availability.tvoc),
      pm1: Boolean(availability.pm1),
      pm10: Boolean(availability.pm10),
      pm25: Boolean(availability.pm25),
      pressure: Boolean(availability.pressure),
      humidity: Boolean(availability.humidity),
      temperature: Boolean(availability.temperature)
    },
    sensors: {
      pm1: Number.isFinite(sensors.pm1) ? Number(sensors.pm1) : null,
      pm25: Number.isFinite(sensors.pm25) ? Number(sensors.pm25) : null,
      pm10: Number.isFinite(sensors.pm10) ? Number(sensors.pm10) : null,
      temperature: Number.isFinite(sensors.temperature) ? Number(sensors.temperature) : null,
      humidity: Number.isFinite(sensors.humidity) ? Number(sensors.humidity) : null,
      pressure: Number.isFinite(sensors.pressure) ? Number(sensors.pressure) : null,
      co2: Number.isFinite(sensors.co2) ? Number(sensors.co2) : null,
      tvoc: Number.isFinite(sensors.tvoc) ? Number(sensors.tvoc) : null
    },
    meta: {
      indoor: Boolean(meta.indoor),
      lat: Number.isFinite(meta.lat) ? Number(meta.lat) : null,
      lon: Number.isFinite(meta.lon) ? Number(meta.lon) : null
    }
  };

  return {
    friendlyName: typeof payload?.friendly_name === 'string' && payload.friendly_name.trim().length > 0
      ? payload.friendly_name.trim()
      : 'Air Quality Monitor',
    token: typeof payload?.token === 'string' ? payload.token.trim() : '',
    record
  };
}

function appendHistory(device, record) {
  const maxRecords = Number(process.env.MAX_HISTORY || 500);
  device.history.push(record);
  if (device.history.length > maxRecords) {
    device.history = device.history.slice(device.history.length - maxRecords);
  }
}

function createDevice(db, friendlyName) {
  const token = generateToken();
  const now = new Date().toISOString();
  const device = {
    id: db.nextDeviceId++,
    token,
    friendlyName,
    createdAt: now,
    lastSeenAt: now,
    latest: null,
    history: []
  };
  db.devices.push(device);
  return device;
}

function ingestUpload(payload, sourceIp) {
  const db = loadDb();
  const normalized = normalizeUpload(payload);

  let device;
  let response = {};

  if (!normalized.token) {
    device = createDevice(db, normalized.friendlyName);
    response.token = device.token;
  } else {
    device = db.devices.find((candidate) => candidate.token === normalized.token);
    if (!device) {
      return {
        status: 401,
        body: {
          error: 'invalid_token'
        }
      };
    }
  }

  device.friendlyName = normalized.friendlyName;
  device.lastSeenAt = normalized.record.timestamp;
  device.latest = {
    ...normalized.record,
    sourceIp
  };

  appendHistory(device, {
    ...normalized.record,
    sourceIp
  });

  saveDb(db);

  return {
    status: 200,
    body: response
  };
}

function listStations() {
  const db = loadDb();

  return db.devices
    .filter((device) => device.latest !== null)
    .map((device) => ({
      id: device.id,
      friendly_name: device.friendlyName,
      last_seen_at: device.lastSeenAt,
      meta: device.latest.meta,
      sensors: device.latest.sensors,
      availability: device.latest.availability,
      uptime: device.latest.uptime
    }));
}

function getStationHistory(stationId, limit = 100) {
  const db = loadDb();
  const id = Number(stationId);

  if (!Number.isInteger(id)) {
    return null;
  }

  const station = db.devices.find((device) => device.id === id);
  if (!station) {
    return null;
  }

  const maxLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));

  return {
    id: station.id,
    friendly_name: station.friendlyName,
    history: station.history.slice(station.history.length - maxLimit)
  };
}

module.exports = {
  ingestUpload,
  listStations,
  getStationHistory
};
