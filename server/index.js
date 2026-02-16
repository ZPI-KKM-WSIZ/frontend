const path = require('path');
const express = require('express');
const store = require('./store');

const app = express();

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

app.post('/api/v1/device/upload', (req, res) => {
  const upload = req.body;

  if (!upload || typeof upload !== 'object') {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const result = store.ingestUpload(upload, req.ip || 'unknown');
  return res.status(result.status).json(result.body);
});

app.get('/api/v1/public/stations', (_req, res) => {
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
