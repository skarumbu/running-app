# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal running app built around how each run *felt*: body, gear, weather and soundtrack, with distance and time tucked away. React SPA hosted on Azure Static Web Apps (and wrapped for iOS with Capacitor); Python Azure Functions backend with Azure PostgreSQL.

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
- Run `api/schema.sql` once to create tables (a fresh database), or the files in `api/migrations/` to bring an existing one up to date

## Architecture

### Frontend (`/src`)
- **`AuthContext.tsx`** — Google Identity Services (GIS) client-side auth. Stores JWT in `sessionStorage`, sends it as `Authorization: Bearer` header. Calls `GET /api/users/me` on login to auto-register new users and populate context.
- **`Layout.tsx`** — Bottom tab nav: Run, Runs, Gear. Sign-out lives in the Gear tab header.
- **`/lib/feel.ts`** — The run-feel vocabulary as typed tables: the 5-level feel scale, 3-level gear comfort, body tags, weather-feel tags, mid-run notes, music kinds, gear kinds and the accent each maps to. Look words and colours up here; don't branch on values in screens. Tag keys mirror the tuples at the top of `api/function_app.py`.
- **`/lib/runTypes.ts`** — API shapes for runs and gear.
- **`/components/`** — Shared UI: `RunFeelForm` (the "How was it?" form, also used to edit a run), `WeatherCard`, `WeatherIcon`, icons, and `components.css` with the shared primitives (cards, chips, tags, big buttons, inputs).
- **`/modules/run/`** — Start (weather, gear picks, soundtrack) → during (start/pause/finish state machine, one-tap mid-run notes, time and distance kept quiet) → "How was it?" (one POST with the run and how it felt).
- **`/modules/runs/`** — Runs list (cards banded by feel, no distances) and run detail (feel hero, gear comfort, soundtrack, Leaflet route map, collapsed "By the numbers", edit).
- **`/modules/gear/`** — Gear closet: add, edit, retire; run count, typical comfort and a pattern line (needs 3+ rated runs on an item).
- **`/hooks/useGPS.ts`** — `watchPosition` wrapper, Haversine distance, coarse accuracy filter (>100m discarded), ~25m waypoint thinning, no re-renders while backgrounded
- **`/hooks/useRunTimer.ts`** — Elapsed time with pause/resume support

### API (`/api/function_app.py`)
Python Azure Functions v2. Auth via `Authorization: Bearer {google_id_token}` header. Token verified against `oauth2.googleapis.com/tokeninfo`. Any authenticated Google account is accepted; users are auto-registered on first request.

| Route | Method | Purpose |
|---|---|---|
| `/api/users/me` | GET | Get/create current user from Google identity |
| `/api/runs` | GET | List all runs for current user (newest first) |
| `/api/runs/bests` | GET | Aggregate stats: total runs, total km, best pace, longest run |
| `/api/runs` | POST | Save completed run plus how it felt (feel, tags, music, mid-run notes, note, gear comfort); computes + upserts badges |
| `/api/runs/{id}` | GET | Single run with waypoints, feel fields, gear worn + badges earned |
| `/api/runs/{id}` | PATCH | Edit note, feel, tags, music, mid-run notes and/or gear |
| `/api/runs/{id}` | DELETE | Delete a run |
| `/api/gear` | GET | Gear closet with run_count, rated_count, avg_comfort |
| `/api/gear` | POST | Add gear (name, kind, color) |
| `/api/gear/{id}` | PATCH | Edit name/kind/color, or retire (`retired: true`) |
| `/api/badges` | GET | All badges earned by current user (no longer shown in the UI) |

### Database (PostgreSQL)
Schema in `api/schema.sql`; changes for existing databases in `api/migrations/` (idempotent, run manually before deploying the API that needs them). Tables: `users`, `runs` (waypoints, weather and the feel fields stored on the row), `badges`, `gear`, `run_gear` (gear worn on a run, with comfort 1–3 and a note).

Badge types: `first_run`, `5k`, `10k`, `21k`, `42k`, `longest_streak`. Computed server-side on `POST /api/runs` using `ON CONFLICT DO NOTHING` — idempotent.

### Infrastructure
All Azure resources declared in `azure-infrastructure/modules/runningapp.bicep` and deployed via `azure-infrastructure/running-app.bicep`. **Do not create Azure resources lazily in Python code.**

## Design System

Light, bright "Sunrise" theme. All colours and fonts come from CSS variables defined in `src/index.css` — never hardcode hex values or font names. Swapping the palette is a change to that one block.

### Colour tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFF6EA` | Page background; also input and inner-tile fill |
| `--surface` | `#FFFFFF` | Cards, tab bar, unselected chips |
| `--ink` | `#1C1633` | Primary text; selected chips; secondary big button |
| `--muted` | `#776F8C` | Labels, secondary text |
| `--line` | `#F1E3D0` | Borders, card bottom shadow, dashed dividers, the neutral band for runs with no feel |
| `--a1` | `#FF4F5E` | Coral: primary action, active tab, "Flying" |
| `--a2` | `#FFC531` | Sun: "Good", comfort "Fine", pre-run weather card |
| `--a3` | `#3DB9FF` | Sky: "Meh", weather card, focus ring |
| `--a4` | `#2ED6A0` | Mint: "Steady", comfort "Felt great", pattern card |
| `--a5` | `#9B6BFF` | Violet: "Rough", comfort "Bothered me" |
| `--on-a1` … `--on-a5` | white or `--ink` | Text drawn on that accent (ink on a2/a3/a4, white on a1/a5) |
| `--a1-deep`, `--ink-deep` | | Pressed-edge shadow under big buttons |
| `--danger` | `#C2253A` | Error text |

In TSX, use `accentVar(key)` / `onAccentVar(key)` from `src/lib/feel.ts` rather than writing `var(--a1)` by hand; gear stores its colour as an accent key (`a1`–`a5`).

### Typography tokens
- `--font-display` — Bricolage Grotesque, for headlines, card titles and big words ("Felt flying.")
- `--font-ui` — Archivo, for labels, buttons, body
- `--font-mono` — JetBrains Mono, for numbers (time, distance, pace)

### Patterns to follow (shared classes in `src/components/components.css`)
- **Page** — `.page`: 20px side padding, 14px gap between sections.
- **Headings** — `.eyebrow` (11px uppercase, 0.16em tracking, `--muted`) above `.h` (30px Bricolage 800). Card titles use `.h2` (18px Bricolage 800).
- **Cards** — `.card`: `--surface`, `border-radius: 22px`, padding 16px, `box-shadow: 0 2px 0 var(--line)`. Hero cards (run feel, mid-run "How's it going?") are filled with an accent, radius 28px.
- **Chips** — `.chip` toggles: 2px `--line` border, pill; `aria-pressed="true"` fills with `--ink`. Read-only labels are `.tag` (small pill on `--bg`).
- **Primary button** — `.big-btn`: full width, 66px tall, radius 22px, `--a1` with a 5px `--a1-deep` bottom edge that presses down on `:active`. Variants `.ink` and `.outline`.
- **Small buttons** — `.pill-btn` (bordered pill) and `.link-btn` (text only, `--muted`).
- **Inputs** — `.txt`: `--bg` fill, no border until focus (`--a3`).
- **Numbers** — `.num` / `--font-mono` with `font-variant-numeric: tabular-nums`. Keep them small and quiet; the app leads with feel, not stats.
- **Buttons** — always `appearance: none` with explicit styles. Never ship an unstyled `<button>`.
- **No hardcoded colours** — add a token to `src/index.css` instead.

### CSS organisation
Shared primitives live in `src/components/components.css`. Each module has its own `.css` file co-located with its `.tsx`; add module-specific classes there, not to `index.css`. Read the existing `.css` files before adding styles to avoid duplication.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys on push to `main`:
1. `npm ci && npm run build`
2. Azure Static Web Apps action deploys frontend + API together

Required GitHub Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`  
Required Azure App Settings: `DATABASE_URL`, `GOOGLE_CLIENT_ID`  
Required GitHub Secret (build): `REACT_APP_GOOGLE_CLIENT_ID`
