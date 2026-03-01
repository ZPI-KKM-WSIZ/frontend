const map = L.map('map', {
  zoomControl: false,
  attributionControl: true
}).setView([52.1, 19.4], 6);

L.control.zoom({ position: 'topright' }).addTo(map);
map.attributionControl.setPrefix('');

const lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

const darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

let activeTileLayer = null;

const markers = new Map();
const stationsElement = document.getElementById('stations');
const statusElement = document.getElementById('status');
const searchElement = document.getElementById('search');
const locationSearchElement = document.getElementById('location-search');
const locationSearchButtonElement = document.getElementById('location-search-btn');
const locationSearchStatusElement = document.getElementById('location-search-status');
const locationSuggestionsListElement = document.getElementById('location-suggestions-list');
const locateMeButtonElement = document.getElementById('locate-me-btn');
const menuToggleElement = document.getElementById('menu-toggle');
const themeToggleElement = document.getElementById('theme-toggle');
const sidebarElement = document.querySelector('.sidebar');
const detailsNameElement = document.getElementById('details-name');
const detailsTimeElement = document.getElementById('details-time');
const detailsBackElement = document.getElementById('details-back');
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
let locationMarker = null;
let userLocationMarker = null;
let userLocationCircle = null;
let locationSuggestAbortController = null;
let locationSuggestDebounceTimer = null;
let locationSuggestionResults = [];
let activeSuggestionIndex = -1;
const THEME_KEY = 'aq-cloud-theme';

function moveAttributionIntoSidebar() {
  if (!sidebarElement) {
    return;
  }

  const attribution = document.querySelector('.leaflet-control-attribution');
  if (!attribution || sidebarElement.contains(attribution)) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'sidebar-attribution';
  wrapper.appendChild(attribution);
  sidebarElement.appendChild(wrapper);
}

function isCompactMobile() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function setMobileDetailsOpen(open) {
  document.body.classList.toggle('mobile-details-open', open);
}

function applyPanelsVisibility(hidden) {
  document.body.classList.toggle('panels-hidden', hidden);
  menuToggleElement.textContent = '☰ Menu';
  menuToggleElement.setAttribute('aria-expanded', String(!hidden));
  window.setTimeout(() => {
    map.invalidateSize();
  }, 120);
}

function initMenuToggle() {
  applyPanelsVisibility(window.matchMedia('(max-width: 760px)').matches);
  setMobileDetailsOpen(false);

  menuToggleElement.addEventListener('click', () => {
    const hidden = document.body.classList.contains('panels-hidden');
    applyPanelsVisibility(!hidden);
  });
}

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function buildGeocodeQueries(input) {
  const base = input.trim();
  const ascii = stripDiacritics(base);
  const variants = [
    base,
    `${base}, Polska`,
    ascii,
    `${ascii}, Polska`
  ];

  const seen = new Set();
  return variants.filter((entry) => {
    const key = entry.toLowerCase();
    if (!entry || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchNominatim(query, limit, signal) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&accept-language=pl&q=${encodeURIComponent(query)}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const results = await response.json();
  if (!Array.isArray(results)) {
    return [];
  }

  return results;
}

async function findLocations(query, limit, signal) {
  const queries = buildGeocodeQueries(query);

  for (const variant of queries) {
    const results = await fetchNominatim(variant, limit, signal);
    if (results.length > 0) {
      return results;
    }
  }

  return [];
}

function resolveInitialTheme() {
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    return 'light';
  }
  return 'dark';
}

function setMapTileTheme(theme) {
  const wantedLayer = theme === 'dark' ? darkTileLayer : lightTileLayer;

  if (activeTileLayer === wantedLayer) {
    return;
  }

  if (activeTileLayer) {
    map.removeLayer(activeTileLayer);
  }

  wantedLayer.addTo(map);
  activeTileLayer = wantedLayer;
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  themeToggleElement.textContent = theme === 'dark' ? 'Tryb: Dark' : 'Tryb: Light';
  setMapTileTheme(theme);
}

function initThemeToggle() {
  applyTheme(resolveInitialTheme());

  themeToggleElement.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  });
}

moveAttributionIntoSidebar();

async function searchLocation() {
  const query = locationSearchElement.value.trim();
  if (!query) {
    locationSearchStatusElement.textContent = 'Wpisz lokalizację do wyszukania.';
    return;
  }

  locationSearchStatusElement.textContent = 'Szukam lokalizacji...';

  try {
    let result = locationSuggestionResults.find((entry) => entry.display_name === query);

    if (!result) {
      const results = await findLocations(query, 1);
      if (!Array.isArray(results) || results.length === 0) {
        locationSearchStatusElement.textContent = 'Nie znaleziono tej lokalizacji.';
        return;
      }

      [result] = results;
    }

    const lat = Number(result.lat);
    const lon = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      locationSearchStatusElement.textContent = 'Lokalizacja ma nieprawidłowe współrzędne.';
      return;
    }

    focusOnLocation(result);
    hideSuggestionList();
    locationSearchStatusElement.textContent = `Znaleziono: ${result.display_name}`;
  } catch (error) {
    locationSearchStatusElement.textContent = `Błąd wyszukiwania: ${error.message}`;
  }
}

function hideSuggestionList() {
  locationSuggestionsListElement.classList.remove('visible');
}

function focusOnLocation(result) {
  const lat = Number(result.lat);
  const lon = Number(result.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    locationSearchStatusElement.textContent = 'Lokalizacja ma nieprawidłowe współrzędne.';
    return;
  }

  map.setView([lat, lon], Math.max(map.getZoom(), 12));

  if (locationMarker) {
    map.removeLayer(locationMarker);
  }

  locationMarker = L.marker([lat, lon]).addTo(map).bindPopup(`<strong>${result.display_name}</strong>`).openPopup();
}

function renderLocationSuggestions(results) {
  locationSuggestionsListElement.innerHTML = '';
  activeSuggestionIndex = -1;

  if (!results.length) {
    hideSuggestionList();
    return;
  }

  results.forEach((entry, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';

    const [main, ...rest] = entry.display_name.split(',');
    const sub = rest.join(',').trim();

    button.innerHTML = `<span class="suggestion-main">${main.trim()}</span><span class="suggestion-sub">${sub || 'Lokalizacja'}</span>`;
    button.addEventListener('click', () => {
      activeSuggestionIndex = index;
      locationSearchElement.value = entry.display_name;
      focusOnLocation(entry);
      hideSuggestionList();
      locationSearchStatusElement.textContent = `Znaleziono: ${entry.display_name}`;
    });

    li.appendChild(button);
    locationSuggestionsListElement.appendChild(li);
  });

  locationSuggestionsListElement.classList.add('visible');
}

function highlightSuggestion(index) {
  const buttons = locationSuggestionsListElement.querySelectorAll('.suggestion-item');
  buttons.forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === index);
  });
}

async function fetchLocationSuggestions(query) {
  if (locationSuggestAbortController) {
    locationSuggestAbortController.abort();
  }

  locationSuggestAbortController = new AbortController();

  try {
    const results = await findLocations(query, 6, locationSuggestAbortController.signal);
    if (!Array.isArray(results) || results.length === 0) {
      locationSuggestionResults = [];
      renderLocationSuggestions([]);
      locationSearchStatusElement.textContent = 'Nie znaleziono tej lokalizacji.';
      return;
    }

    locationSuggestionResults = results;
    renderLocationSuggestions(results);
    locationSearchStatusElement.textContent = `Podpowiedzi: ${results.length}`;
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    locationSuggestionResults = [];
    renderLocationSuggestions([]);
    locationSearchStatusElement.textContent = `Błąd podpowiedzi: ${error.message}`;
  }
}

function queueLocationSuggestions() {
  const query = locationSearchElement.value.trim();
  if (query.length < 3) {
    locationSuggestionResults = [];
    renderLocationSuggestions([]);
    locationSearchStatusElement.textContent = 'Wpisz min. 3 znaki, aby zobaczyć podpowiedzi.';
    return;
  }

  if (locationSuggestDebounceTimer) {
    window.clearTimeout(locationSuggestDebounceTimer);
  }

  locationSuggestDebounceTimer = window.setTimeout(() => {
    fetchLocationSuggestions(query);
  }, 250);
}

function locateUser() {
  if (!navigator.geolocation) {
    locationSearchStatusElement.textContent = 'Ta przeglądarka nie obsługuje geolokalizacji.';
    return;
  }

  locateMeButtonElement.disabled = true;
  locationSearchStatusElement.textContent = 'Pobieram Twoją lokalizację...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
      }
      if (userLocationCircle) {
        map.removeLayer(userLocationCircle);
      }

      userLocationMarker = L.marker([lat, lon]).addTo(map).bindPopup('<strong>Twoja lokalizacja</strong>').openPopup();
      userLocationMarker.on('popupclose', () => {
        if (userLocationMarker) {
          map.removeLayer(userLocationMarker);
          userLocationMarker = null;
        }
        if (userLocationCircle) {
          map.removeLayer(userLocationCircle);
          userLocationCircle = null;
        }
      });

      userLocationCircle = L.circle([lat, lon], {
        radius: Math.max(accuracy, 20),
        color: '#3b82f6',
        fillColor: '#60a5fa',
        fillOpacity: 0.18,
        weight: 1
      }).addTo(map);

      map.setView([lat, lon], Math.max(map.getZoom(), 13));
      locationSearchStatusElement.textContent = `Twoja lokalizacja znaleziona (dokładność ~${Math.round(accuracy)} m).`;
      locateMeButtonElement.disabled = false;
    },
    (error) => {
      const messageByCode = {
        1: 'Brak zgody na udostępnienie lokalizacji.',
        2: 'Nie udało się ustalić lokalizacji.',
        3: 'Przekroczono czas oczekiwania na lokalizację.'
      };

      locationSearchStatusElement.textContent = messageByCode[error.code] || 'Błąd pobierania lokalizacji.';
      locateMeButtonElement.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    }
  );
}

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

  if (station && isCompactMobile()) {
    setMobileDetailsOpen(true);
    applyPanelsVisibility(false);
  }

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
  if (isCompactMobile()) {
    setMobileDetailsOpen(false);
  }
  renderStations(stationsCache);
});

locationSearchButtonElement.addEventListener('click', searchLocation);
locationSearchElement.addEventListener('input', queueLocationSuggestions);
locationSearchElement.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' && locationSuggestionResults.length > 0) {
    event.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, locationSuggestionResults.length - 1);
    highlightSuggestion(activeSuggestionIndex);
    return;
  }

  if (event.key === 'ArrowUp' && locationSuggestionResults.length > 0) {
    event.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    highlightSuggestion(activeSuggestionIndex);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();

    if (activeSuggestionIndex >= 0 && locationSuggestionResults[activeSuggestionIndex]) {
      const selected = locationSuggestionResults[activeSuggestionIndex];
      locationSearchElement.value = selected.display_name;
      focusOnLocation(selected);
      hideSuggestionList();
      locationSearchStatusElement.textContent = `Znaleziono: ${selected.display_name}`;
      return;
    }

    searchLocation();
  }
});

locationSearchElement.addEventListener('blur', () => {
  window.setTimeout(hideSuggestionList, 150);
});

locationSearchElement.addEventListener('focus', () => {
  if (locationSuggestionResults.length > 0) {
    locationSuggestionsListElement.classList.add('visible');
  }
});

locateMeButtonElement.addEventListener('click', locateUser);
detailsBackElement.addEventListener('click', () => {
  setMobileDetailsOpen(false);
});

initMenuToggle();
initThemeToggle();
fetchStations();
setInterval(fetchStations, 20000);
