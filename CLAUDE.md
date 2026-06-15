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

## Design System

Dark-only app. All colours and fonts come from CSS variables defined in `src/index.css` — never hardcode hex values or font names.

### Colour tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E0E10` | Page background |
| `--surface` | `#17171A` | Slightly elevated surface |
| `--card` | `#1F1F23` | Cards, inputs, toggles |
| `--card2` | `#28282E` | Nested card / hover state |
| `--line` | `rgba(255,255,255,0.07)` | Subtle dividers and borders |
| `--line-strong` | `rgba(255,255,255,0.12)` | More visible borders |
| `--text` | `#F6F4EF` | Primary text |
| `--text-muted` | `#8A8A8E` | Secondary / label text |
| `--text-faint` | `#555558` | Placeholder / disabled text |
| `--primary` | `#FF5A36` | Orange accent — CTAs, active states |
| `--primary-ink` | `#FFFFFF` | Text on primary-coloured backgrounds |

### Typography tokens
- `--font-display` — Archivo, used for headings and large UI text
- `--font-ui` — Archivo, used for labels, buttons, body
- `--font-mono` — JetBrains Mono, used for numeric metrics (time, distance, pace)

### Patterns to follow
- **Buttons** — always use `appearance: none; border: none;` and apply explicit styles. Never ship an unstyled `<button>`.
- **Primary action buttons** — full-width, `height: 60–72px`, `border-radius: 16–20px`, `background: var(--primary)`, `color: var(--primary-ink)`, bold Archivo.
- **Icon/control buttons** — circular (`border-radius: 999px`), `border: 1.5px solid var(--line-strong)`, transparent background.
- **Segmented/toggle controls** — pill container (`background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 999px`, `padding: 3px`). Active segment gets `background: var(--primary); color: var(--primary-ink)`.
- **Cards** — `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 16px`, padding `14–20px`.
- **Labels** — `font-family: var(--font-ui)`, `font-size: 10–11px`, `letter-spacing: 0.14–0.22em`, `text-transform: uppercase`, `font-weight: 600–700`, `color: var(--text-muted)`.
- **Numeric values** — `font-family: var(--font-mono)`, `font-variant-numeric: tabular-nums`.
- **Status pills** — `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 999px`, small uppercase label inside.
- **Spacing** — page padding `22–24px` horizontal. Gap between sections `20–28px`.
- **No hardcoded colours** — if you need a one-off (e.g. error red), use `#E84545` to stay consistent with existing usage.

### CSS organisation
Each module has its own `.css` file co-located with its `.tsx`. Add new classes to the relevant module file, not to `index.css`. Read the existing `.css` file before adding styles to understand the existing class names and avoid duplication.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys on push to `main`:
1. `npm ci && npm run build`
2. Azure Static Web Apps action deploys frontend + API together

Required GitHub Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`  
Required Azure App Settings: `DATABASE_URL`, `GOOGLE_CLIENT_ID`  
Required GitHub Secret (build): `REACT_APP_GOOGLE_CLIENT_ID`
