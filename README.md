# Cloud workspace split

Ten katalog został rozdzielony na dwie wyraźne części:

- `_archive/` — docelowe repozytoria zdalne:
  - `backend` (`https://github.com/ZPI-KKM-WSIZ/backend.git`)
  - `database` (`https://github.com/ZPI-KKM-WSIZ/database.git`)
  - `contracts` (`https://github.com/ZPI-KKM-WSIZ/contracts.git`)
- `local-server/` — lokalny serwer developerski (Express + frontend + lokalny plik `db.json`).

## Lokalny start

```bash
cd cloud/local-server
npm install
npm start
```

## Dlaczego tak

- lokalny stack jest odseparowany od repozytoriów docelowych,
- łatwiej uniknąć pomyłek (np. edycji lokalnego mocka zamiast właściwego backendu),
- przepływ pracy jest czytelny: firmware i testy lokalne -> `local-server`, backend docelowy -> `_archive/backend`.
