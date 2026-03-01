# Cloud workspace split

This directory is divided into two clear parts:

- `_archive/` — target remote repositories:
  - `backend` (`https://github.com/ZPI-KKM-WSIZ/backend.git`)
  - `database` (`https://github.com/ZPI-KKM-WSIZ/database.git`)
  - `contracts` (`https://github.com/ZPI-KKM-WSIZ/contracts.git`)
- `local-server/` — local developer server (Express + frontend + local `db.json` file).

## Local start

```bash
cd cloud/local-server
npm install
npm start
```

## Why this setup

- local stack is separated from target repositories,
- easier to avoid mistakes (e.g., editing a local mock instead of the real backend),
- workflow is clearer: firmware and local tests -> `local-server`, target backend -> `_archive/backend`.
