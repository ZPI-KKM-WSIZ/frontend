const map = L.map('map').setView([52.1, 19.4], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markers = new Map();
const stationsElement = document.getElementById('stations');
const statusElement = document.getElementById('status');
const searchElement = document.getElementById('search');
const detailsNameElement = document.getElementById('details-name');
const detailsTimeElement = document.getElementById('details-time');
const detailFields = {
  pm1: document.getElementById('d-pm1'),
  pm25: document.getElementById('d-pm25'),
  pm10: document.getElementById('d-pm10'),
  temperature: document.getElementById('d-temp'),
  humidity: document.getElementById('d-hum'),
  pressure: document.getElementById('d-pres')
};

let stationsCache = [];
let selectedStationId = null;
let hasAutoFittedBounds = false;

function pmBand(pm25) {
  if (pm25 === null || pm25 === undefined || Number.isNaN(pm25)) {
    return { color: '#64748b', label: 'Brak danych' };
  }

  if (pm25 <= 12) {
    return { color: '#14b86f', label: 'Bardzo dobra' };
  }

  if (pm25 <= 25) {
    return { color: '#84cc16', label: 'Dobra' };
  }

  if (pm25 <= 35) {
    return { color: '#eab308', label: 'Umiarkowana' };
  }

  if (pm25 <= 55) {
    return { color: '#f97316', label: 'Zła' };
  }

  return { color: '#ef4444', label: 'Bardzo zła' };
}

function markerHtml(station) {
  const pm25 = station.sensors?.pm25;
  const band = pmBand(pm25);
  const temperature = station.sensors?.temperature;
  const humidity = station.sensors?.humidity;
  const pressure = station.sensors?.pressure;

  return `
    <strong>${station.friendly_name}</strong><br/>
    Jakość: ${band.label}<br/>
    PM2.5: ${pm25 ?? '-'} µg/m³<br/>
    Temp: ${temperature ?? '-'} °C<br/>
    Wilgotność: ${humidity ?? '-'} %<br/>
    Ciśnienie: ${pressure ?? '-'} hPa<br/>
    Ostatni upload: ${new Date(station.last_seen_at).toLocaleString('pl-PL')}
  `;
}

function toLatLon(station) {
  const lat = Number(station?.meta?.lat);
  const lon = Number(station?.meta?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function updateDetails(station) {
  if (!station) {
    detailsNameElement.textContent = 'Wybierz stację';
    detailsTimeElement.textContent = 'Brak danych';
    Object.values(detailFields).forEach((field) => {
      field.textContent = '-';
    });
    return;
  }

  detailsNameElement.textContent = station.friendly_name;
  detailsTimeElement.textContent = `Ostatni odczyt: ${new Date(station.last_seen_at).toLocaleString('pl-PL')}`;
  detailFields.pm1.textContent = station.sensors?.pm1 ?? '-';
  detailFields.pm25.textContent = station.sensors?.pm25 ?? '-';
  detailFields.pm10.textContent = station.sensors?.pm10 ?? '-';
  detailFields.temperature.textContent = station.sensors?.temperature ?? '-';
  detailFields.humidity.textContent = station.sensors?.humidity ?? '-';
  detailFields.pressure.textContent = station.sensors?.pressure ?? '-';
}

function selectStation(station, shouldCenter = true) {
  selectedStationId = station?.id ?? null;
  renderStations(stationsCache);
  updateDetails(station);

  if (!station || !shouldCenter) {
    return;
  }

  const coordinates = toLatLon(station);
  const marker = markers.get(station.id);

  if (coordinates) {
    map.setView(coordinates, Math.max(map.getZoom(), 11));
  }

  if (marker) {
    marker.openPopup();
  }
}

function renderStations(stations) {
  stationsElement.innerHTML = '';

  const query = searchElement.value.trim().toLowerCase();
  const filtered = stations.filter((station) => {
    if (!query) {
      return true;
    }
    return station.friendly_name.toLowerCase().includes(query);
  });

  const activeIds = new Set();

  filtered.forEach((station) => {
    const coordinates = toLatLon(station);
    const pm25 = station.sensors?.pm25;
    const band = pmBand(pm25);
    activeIds.add(station.id);

    const item = document.createElement('li');
    item.className = 'station-row';
    if (station.id === selectedStationId) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <div class="dot" style="background:${band.color}"></div>
      <div>
        <div class="name">${station.friendly_name}</div>
        <div class="meta">${band.label} · PM2.5: ${pm25 ?? '-'} µg/m³</div>
      </div>
    `;

    item.addEventListener('click', () => {
      selectStation(station);
    });

    stationsElement.appendChild(item);

    if (coordinates) {
      if (markers.has(station.id)) {
        const existing = markers.get(station.id);
        existing.setLatLng(coordinates);
        existing.setStyle({
          color: band.color,
          fillColor: band.color
        });
        existing.setPopupContent(markerHtml(station));
      } else {
        const marker = L.circleMarker(coordinates, {
          radius: station.id === selectedStationId ? 10 : 8,
          color: band.color,
          fillColor: band.color,
          fillOpacity: 0.86,
          weight: 1
        })
          .bindPopup(markerHtml(station))
          .addTo(map);

        marker.on('click', () => {
          selectStation(station, false);
        });

        markers.set(station.id, marker);
      }
    }
  });

  markers.forEach((marker, stationId) => {
    if (!activeIds.has(stationId)) {
      map.removeLayer(marker);
      markers.delete(stationId);
      return;
    }

    const station = stations.find((entry) => entry.id === stationId);
    const size = stationId === selectedStationId ? 10 : 8;
    marker.setRadius(size);
    if (station) {
      marker.setPopupContent(markerHtml(station));
    }
  });

  if (!hasAutoFittedBounds) {
    const coords = stations
      .map((station) => toLatLon(station))
      .filter((value) => value !== null);

    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [48, 48] });
      hasAutoFittedBounds = true;
    } else if (coords.length === 1) {
      map.setView(coords[0], 11);
      hasAutoFittedBounds = true;
    }
  }

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'station-row';
    empty.innerHTML = '<div><div class="name">Brak wyników</div><div class="meta">Zmień frazę wyszukiwania</div></div>';
    stationsElement.appendChild(empty);
  }
}

function ensureSelectedStation() {
  if (stationsCache.length === 0) {
    selectedStationId = null;
    updateDetails(null);
    return;
  }

  const selected = stationsCache.find((station) => station.id === selectedStationId);
  if (selected) {
    updateDetails(selected);
    return;
  }

  selectedStationId = stationsCache[0].id;
  updateDetails(stationsCache[0]);
}

async function fetchStations() {
  try {
    const response = await fetch('/api/v1/public/stations');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    stationsCache = Array.isArray(payload.stations) ? payload.stations : [];

    statusElement.textContent = `Stacji online: ${stationsCache.length} · aktualizacja ${new Date().toLocaleTimeString('pl-PL')}`;
    ensureSelectedStation();
    renderStations(stationsCache);
  } catch (error) {
    statusElement.textContent = `Błąd pobierania danych: ${error.message}`;
  }
}

searchElement.addEventListener('input', () => {
  renderStations(stationsCache);
});

fetchStations();
setInterval(fetchStations, 20000);
