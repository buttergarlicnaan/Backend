# GeoEnhance Backend

Node.js + Express + TypeScript API for GeoEnhance.

This repository is independent from the frontend. Copernicus, Sentinel Hub, and the ML model are not included yet.

## Stack

- Node.js
- Express
- TypeScript

Dependencies are managed with `package.json` and `package-lock.json`. Never commit `node_modules/`.

## Run locally

```bash
npm install
npm run dev
```

The API starts at `http://localhost:8000`.

Copy `.env.example` to `.env` for local overrides:

```
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
```

Do not put Copernicus credentials in these files yet.

## Scripts

```bash
npm run dev      # tsx watch
npm run build    # compile to dist/
npm start        # run compiled dist/server.js
```

For a clean install from the lockfile:

```bash
npm ci
```

## Health check

```
GET /api/health
```

```json
{ "status": "ok" }
```

The frontend (Vite) runs separately at `http://localhost:5173`. CORS allows that origin.

## Layout

- `src/config` — environment
- `src/middleware` — 404 and error handling
- `src/modules/health` — health route
- `src/modules/imagery` — scaffolding for later satellite fetch (not implemented)
- `src/app.ts` — Express app
- `src/server.ts` — process entry
