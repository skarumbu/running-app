# Incident: Azure Functions Python Worker Indexing Failure

**Date:** 2026-05-29  
**Function App:** `running-app-prod-api` (RG: `running-app-prod-rg`)  
**Status:** Fix deployed (df37c3a) — awaiting confirmation

---

## Symptom

Every API route returns 404. The Azure Functions host initializes in ~2ms and reports 0 functions found. The app is running — it just has nothing registered.

---

## Timeline of Investigation

### What was known at the start

The API had been broken for several sessions. The deployment mechanism was believed to be the culprit, but the root cause had not been isolated.

### Deployment mechanism — confirmed correct

- CI installs `pg8000` and `shared_logging` into `api/.python_packages/lib/site-packages/` using `pip install -t`
- `func azure functionapp publish running-app-prod-api --python --no-build` uploads a ZIP to blob storage and sets `WEBSITE_RUN_FROM_PACKAGE` to the blob SAS URL
- `PYTHONPATH=/home/site/wwwroot/.python_packages/lib/site-packages` is set as an app setting, so packages in the ZIP are importable
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false` prevents Oryx from running (Oryx would try to pip install but can't install `shared_logging` from git)
- `AzureWebJobsFeatureFlags=EnableWorkerIndexing` is required for the Python v2 decorator model (`@app.route`)

The deployment mechanism itself is sound. The "0 functions found (Custom)" message that appears immediately after `func publish` completes is a **timing artifact** — the host syncs triggers before the Python worker finishes loading the new code. This message is harmless on its own.

### Cold start / warm worker confusion

Linux Consumption workers keep old code in memory for ~20 minutes after a new deployment. This caused significant confusion: new code was deployed but old behavior persisted. Adding `az functionapp restart` to CI appeared to fix this, but introduced a death loop:

- 0 functions loaded → platform health check fails → instance killed in ~6 seconds → restart triggers again → repeat

The restart step was removed. Without it, workers eventually recycle naturally, but this takes 15–20 minutes.

### Minimal function_app.py — confirmed working

A stripped-down `function_app.py` containing only:
```python
import azure.functions as func
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="health")
def health(req): ...
```
returned 200 OK after a normal cold start. This proved the deployment pipeline and worker indexing both work when pg8000 is not involved.

### pg8000 import — root cause identified

Any `function_app.py` that imports `pg8000` at module level results in 0 functions registered. This held true even when the import was wrapped in `try/except`:

```python
# This was enough to break worker indexing:
try:
    import pg8000.dbapi
except Exception as _e:
    _diag["pg8000"] = str(_e)
```

The worker still reported 0 functions. This rules out `ModuleNotFoundError` as the cause — the exception would have been caught, and `app = func.FunctionApp(...)` would have run normally, registering the routes.

**The most likely mechanism:** pg8000 (or one of its dependencies) has a side effect during import — likely spawning a thread, registering a signal handler, touching `asyncio`, or modifying `sys.modules` — that interferes with the Python worker's function indexing phase. The Azure Functions v2 worker uses `EnableWorkerIndexing`, which indexes functions by importing the module in a controlled environment. Something pg8000 does during import disrupts that environment enough to prevent any `@app.route` registrations from being seen.

This is not a pg8000 version issue or an installation issue — it is a module-load-time side-effect issue specific to the Azure Functions worker indexing context.

### Diagnostic dead-ends

- `sys.path` manipulation in `function_app.py` was tried and removed — had no effect
- Explicit `PYTHONPATH` in the app settings is correct and sufficient
- Removing `shared_logging` as a dependency had no effect on the 0-functions problem
- The `az functionapp restart` step in CI made things worse (death loop), not better

---

## Fix Applied (df37c3a)

Move all pg8000 imports from module level to inside the functions that use them:

```python
# Before — breaks worker indexing:
try:
    import pg8000.dbapi
except Exception as _e:
    _diag["pg8000"] = str(_e)

# After — lazy import, module loads cleanly:
def get_conn():
    import pg8000.dbapi        # imported here, after all @app.route decorators run
    ...

@app.route(route="health")
def health(req):
    try:
        import pg8000.dbapi    # import tested on demand, not at module load
    except Exception as e:
        diag["pg8000"] = str(e)
    ...
```

With this change, the module-level code imports only stdlib (`json`, `os`, `ssl`, `logging`, `urllib.request`, `datetime`) and `azure.functions`. The `@app.route` decorators run unconditionally, the worker indexes all functions, and pg8000 is first imported on the initial database call.

---

## Verification Steps

After CI completes (~5 minutes from push):

1. **`GET /api/health`** → should return `{"errors": {}, "sys_path": [...]}` (empty errors = pg8000 imported fine)
2. **`GET /api/users/me`** → should return `401 Unauthorized` (not 404 — proves route is registered)
3. If health shows `{"errors": {"pg8000": "..."}}` → pg8000 failed to import at call time; investigate package installation in CI

---

## Key Settings Reference

| Setting | Value | Purpose |
|---|---|---|
| `FUNCTIONS_WORKER_RUNTIME` | `python` | Selects Python worker |
| `AzureWebJobsFeatureFlags` | `EnableWorkerIndexing` | Required for Python v2 `@app.route` model |
| `linuxFxVersion` | `Python\|3.11` | Python version |
| `PYTHONPATH` | `/home/site/wwwroot/.python_packages/lib/site-packages` | Makes vendored packages importable |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | Prevents Oryx from running (breaks on git dependencies) |
| `WEBSITE_RUN_FROM_PACKAGE` | `<blob SAS URL>` | Set by `func publish`; worker mounts ZIP read-only |

---

## Lessons

1. **`try/except` around an import does not protect the worker indexer.** The Azure Functions worker indexing phase is sensitive to module-level side effects beyond just exceptions. An import that succeeds (or fails silently) can still prevent function registration if it has the wrong side effects.

2. **Keep module-level imports minimal in Azure Functions Python v2.** Only import what is needed to register routes. Defer database drivers, heavy libraries, and anything with non-obvious import-time behavior to inside the handler or helper functions.

3. **The "0 functions" message immediately after `func publish` is normal.** It reflects the host syncing triggers before the worker has loaded. Only worry if it persists 10+ minutes after deploy.

4. **`az functionapp restart` after deploy on Linux Consumption is dangerous.** If the new code fails to load for any reason, the restart creates a health-check death loop. The safer approach is to wait for natural worker recycling (~15–20 min) and use `/api/health` to confirm.

5. **Isolate variables with a minimal repro.** The breakthrough came from deploying a `function_app.py` with zero pg8000 usage. That confirmed the deployment pipeline was fine and narrowed the issue to the import itself.
