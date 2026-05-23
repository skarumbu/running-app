# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal running tracker PWA. React SPA hosted on Azure Static Web Apps; Python Azure Functions backend with Azure PostgreSQL. GPS tracking, run history, route maps, and badges.

## Commands

### Frontend
```bash
npm start          # Dev server at localhost:3000
npm run build      # Production build → build/
npm test           # Jest via react-scripts
```

### API (run from `api/` directory)
```bash
func start         # Requires Azure Functions Core Tools v4 + api/local.settings.json
```

### Local dev prerequisites
- `api/local.settings.json` must have `DATABASE_URL` pointing at a local or remote Postgres instance
- Run `api/schema.sql` once to create tables

## Architecture

### Frontend (`/src`)
- **`AuthContext.tsx`** — Google Identity Services (GIS) client-side auth. Stores JWT in `sessionStorage`, sends it as `Authorization: Bearer` header. Calls `GET /api/users/me` on login to auto-register new users and populate context.
- **`Layout.tsx`** — Bottom tab nav (Track, History, Profile) + topbar with sign-out
- **`/modules/track/`** — GPS run tracker: start/pause/finish state machine, live metrics
- **`/modules/history/`** — Run list, weekly distance chart (Recharts), per-run detail with Leaflet route map
- **`/modules/profile/`** — Personal bests grid, badge grid
- **`/hooks/useGPS.ts`** — `watchPosition` wrapper, Haversine distance, accuracy filtering (>30m discarded)
- **`/hooks/useRunTimer.ts`** — Elapsed time with pause/resume support
- **`/hooks/useWakeLock.ts`** — Screen Wake Lock API (keeps screen on during run)

### API (`/api/function_app.py`)
Python Azure Functions v2. Auth via `Authorization: Bearer {google_id_token}` header. Token verified against `oauth2.googleapis.com/tokeninfo`. Any authenticated Google account is accepted; users are auto-registered on first request.

| Route | Method | Purpose |
|---|---|---|
| `/api/users/me` | GET | Get/create current user from Google identity |
| `/api/runs` | GET | List all runs for current user (newest first) |
| `/api/runs/bests` | GET | Aggregate stats: total runs, total km, best pace, longest run |
| `/api/runs` | POST | Save completed run; computes + upserts badges |
| `/api/runs/{id}` | GET | Single run with waypoints + badges earned |
| `/api/runs/{id}` | DELETE | Delete a run |
| `/api/badges` | GET | All badges earned by current user |

### Database (PostgreSQL)
Schema in `api/schema.sql`. Three tables: `users`, `runs`, `waypoints` (stored as JSONB in runs), `badges`.

Badge types: `first_run`, `5k`, `10k`, `21k`, `42k`, `longest_streak`. Computed server-side on `POST /api/runs` using `ON CONFLICT DO NOTHING` — idempotent.

### Infrastructure
All Azure resources declared in `azure-infrastructure/modules/runningapp.bicep` and deployed via `azure-infrastructure/running-app.bicep`. **Do not create Azure resources lazily in Python code.**

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys on push to `main`:
1. `npm ci && npm run build`
2. Azure Static Web Apps action deploys frontend + API together

Required GitHub Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`  
Required Azure App Settings: `DATABASE_URL`, `GOOGLE_CLIENT_ID`  
Required GitHub Secret (build): `REACT_APP_GOOGLE_CLIENT_ID`
