# GeoEnhance Backend

Node.js + Express + TypeScript API gateway for GeoEnhance satellite super-resolution.

The backend ingests multi-temporal Sentinel-2 L2A optical and auxiliary raster bands from the Copernicus Data Space Ecosystem (CDSE), stages 19-channel GeoTIFFs and visual previews in Supabase Storage, dispatches inference jobs to a Python FastAPI + Celery worker, and delivers 4-channel super-resolved (`HR_ps`) and uncertainty rasters for client-side WebGL fragment shaders.

## Stack

- **Runtime**: Node.js + TypeScript
- **Web Framework**: Express
- **Cloud Storage**: Supabase Storage (`@supabase/supabase-js`)
- **Data Source**: Copernicus Data Space Ecosystem (CDSE / Sentinel Hub Process & Catalog API)
- **ML Worker**: Python FastAPI + Celery + Redis (`:8001`)

## Architecture & Data Flow

```text
Frontend (Mapbox + WebGL Shaders)
   │
   ├─► POST /api/enhance ─────────────────► Express Gateway (:8000)
   │                                           │
   │                                           ├─► CDSE Catalog & Process API
   │                                           │    (Retrieves 8 frames × 19 bands + previews)
   │                                           │
   │                                           ├─► Supabase Storage ("geoenhance-inputs")
   │                                           │    (Uploads TIFFs + previews, generates signed URLs)
   │                                           │
   │                                           └─► POST :8001/api/tasks/infer
   │                                                    │
   │◄─ ws://localhost:8001/ws/jobs/:id (Live Progress) ─┴─► FastAPI / Celery ML Worker
   │                                                          │
   │                                                          ├─► Runs PyTorch Super-Resolution
   │                                                          │
   │                                                          ├─► Uploads to "geoenhance-outputs"
   │                                                          │    - HR_ps (1054, 1054, 4: R, G, B, NIR)
   │                                                          │    - uncertainty (1054, 1054, 1)
   │                                                          │
   │◄─ GET /api/jobs/:id ◄─── POST /api/jobs/:id/complete ───┘
   │
   └─► Streams GeoTIFFs into WebGL Shaders:
        - True Color (RGB: bands 0, 1, 2)
        - False Color CIR (NIR, Red, Green: bands 3, 0, 1)
        - Live NDVI: (NIR - Red) / (NIR + Red)
        - Uncertainty Heatmap: alpha-blended overlay
```

## ML Input Contract (19 Channels per Frame)

Each of the 8 temporal acquisitions is packaged into a single Float32 multi-band GeoTIFF containing:
1. `B01` - Aerosols (60m)
2. `B02` - Blue (10m)
3. `B03` - Green (10m)
4. `B04` - Red (10m)
5. `B05` - Red Edge 1 (20m)
6. `B06` - Red Edge 2 (20m)
7. `B07` - Red Edge 3 (20m)
8. `B08` - NIR Broad (10m)
9. `B8A` - NIR Narrow (20m)
10. `B09` - Water Vapour (60m)
11. `B11` - SWIR 1 (20m)
12. `B12` - SWIR 2 (20m)
13. `dataMask` - Valid pixel mask (1 = valid, 0 = no-data)
14. `CLM` - Cloud Mask (s2cloudless classification)
15. `CLP` - Cloud Probability (confidence value)
16. `sunAzimuthAngles` - Solar geometry azimuth grid
17. `sunZenithAngles` - Solar geometry zenith grid
18. `viewAzimuthMean` - Mean sensor viewing azimuth
19. `viewZenithMean` - Mean sensor viewing zenith

## ML Output Contract

- `HR_ps`: High-resolution pan-sharpened super-resolution output with shape `(1054, 1054, 4)` in GeoTIFF format (channels: Red, Green, Blue, NIR).
- `uncertainty`: Variance / confidence map with shape `(1054, 1054, 1)` in GeoTIFF format.

## API Endpoints

- `GET /api/health` — Liveness health check.
- `POST /api/enhance` — Dispatches AOI polygon enhancement job. Returns `{ jobId, status: "QUEUED" }`.
- `GET /api/jobs/:jobId` — Fetches job status, temporal frames (with signed TIFF & preview URLs), and super-resolved results.
- `POST /api/jobs/:jobId/complete` — Internal callback from the ML worker to deliver `HR_ps` and `uncertainty` output URLs.

## Run Locally

```bash
npm install
npm run dev
```

The API starts at `http://localhost:8000`.

Copy `.env.example` to `.env` and fill in Copernicus credentials and Supabase keys:

```ini
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173

COPERNICUS_CLIENT_ID=your_client_id
COPERNICUS_CLIENT_SECRET=your_client_secret
COPERNICUS_SEARCH_DAYS=30
COPERNICUS_MAX_CLOUD_COVER=20

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_INPUT_BUCKET=geoenhance-inputs
SUPABASE_OUTPUT_BUCKET=geoenhance-outputs

FASTAPI_WORKER_URL=http://localhost:8001
```

## Scripts

```bash
npm run dev      # run locally with hot-reloading (tsx watch)
npm run build    # compile TypeScript to dist/
npm start        # run compiled server (node dist/server.js)
```
