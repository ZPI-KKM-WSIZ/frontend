# Air Quality Cloud (backend + frontend mapy)

To jest **osobny projekt** od firmware Arduino (`src/`, `include/`, `lib/`, `test/`).
Folder `cloud/` nie jest budowany przez PlatformIO, więc upload na UNO R4 jest bezpieczny.

## Co zawiera

- `web/` — frontend mapy (układ „Airly-like”, legenda PM2.5, panel szczegółów stacji),
- `server/` — backend Express (API uploadu i publiczne endpointy dla frontendu),
- `_archive/` — nieużywane aktualnie materiały „na zapas” (backend/contracts),
- `data/db.json` — lokalna baza danych tworzona automatycznie przy uruchomieniu.

## Szybki start

Wymagania: Node.js 18+.

```bash
cd cloud
npm install
npm start
```

Aplikacja ruszy na `http://localhost:8080`.

## Jak przetestować frontend

1. uruchom `npm start`,
2. otwórz `http://localhost:8080`,
3. sprawdź mapę, legendę PM2.5, listę stacji i panel szczegółów,
4. opcjonalnie zasymuluj upload przykładowym JSON-em na endpoint urządzenia.

## Endpointy

### Upload z urządzenia

`POST /api/v1/device/upload`

Body zgodne z dokumentem projektu (token/availability/meta/sensors).

Przykładowa odpowiedź przy onboardingu:

```json
{
  "token": "abc123-device-token"
}
```

Przy kolejnych uploadach backend może zwracać pusty obiekt `{}`.

### Publiczne dane dla frontendu

- `GET /api/v1/public/stations`
- `GET /api/v1/public/stations/:id/history?limit=100`

## Integracja firmware

W firmware ustaw:

- `Config.serverUrl` -> `http://<twoj-serwer>:8080/api/v1/device/upload`
- `Config.uploadToken` -> puste na starcie (backend zwróci token)

Po pierwszym udanym uploadzie firmware zapisuje token z odpowiedzi i używa go dalej.

## Konfiguracja opcjonalna

- `PORT` (domyślnie `8080`)
- `DATA_FILE` (domyślnie `cloud/data/db.json`)
- `MAX_HISTORY` (domyślnie `500` rekordów na stację)
# frontend
