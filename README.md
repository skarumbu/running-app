# Running App

A personal running tracker PWA. GPS-based distance and pace tracking with per-user run history, route maps, distance charts, and badges.

**Stack:** React (TypeScript) · Azure Static Web Apps · Azure Functions (Python) · Azure PostgreSQL · Google Sign-In

---

## Local Development

```bash
npm install
npm start        # dev server at localhost:3000
```

Fill in `.env` before starting (see [Secrets](#secrets) below). API calls (`/api/*`) won't work locally without also running Azure Functions:

```bash
cd api
pip install -r requirements.txt
func start       # requires Azure Functions Core Tools v4
```

Fill in `api/local.settings.json` with your Postgres connection string first.

---

## Secrets

Both files are gitignored and never committed.

### `api/local.settings.json` — Azure Functions

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "DATABASE_URL": "postgresql://runningadmin:password@localhost:5432/running_app"
  }
}
```

---

## Deployment Setup (one-time)

### 1. Provision infrastructure via Bicep

From `azure-infrastructure/`:

```bash
az deployment sub create \
  --location eastus \
  --template-file running-app.bicep \
  --parameters postgresAdminPassword=<pass> googleClientId=<id> googleClientSecret=<secret> \
               databaseUrl="postgresql://runningadmin:<pass>@running-app-db-prod.postgres.database.azure.com/running_app?sslmode=require"
```

This creates resource group `running-app-prod-rg` containing:
- Azure Static Web App (`running-app-prod`) linked to this repo
- Azure Database for PostgreSQL Flexible Server (`running-app-db-prod`)

Azure automatically adds `AZURE_STATIC_WEB_APPS_API_TOKEN` as a GitHub Actions secret.

### 2. Create a Google OAuth Client

In [Google Cloud Console](https://console.cloud.google.com):
- APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application
- Authorized redirect URI: `https://<swa-url>/.auth/login/google/callback`
- Save the **Client ID** and **Client Secret**

### 3. Run the database schema

```bash
psql "$DATABASE_URL" -f api/schema.sql
```

### 4. Set Azure App Settings

In Azure portal → running-app-prod (Static Web App) → Configuration:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 2 |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from step 2 |
| `DATABASE_URL` | PostgreSQL connection string |

### 5. Push to Deploy

Any push to `main` triggers GitHub Actions and deploys frontend + API automatically.

---

## Installing on Your Phone

**iOS (Safari):** Share → Add to Home Screen

**Android (Chrome):** Menu → Add to Home Screen

Keep the screen awake during runs for best GPS accuracy (iOS background PWA limitation).

---

## Database

Schema lives in `api/schema.sql`. Run it once against the provisioned Postgres instance. Apply future changes manually.
