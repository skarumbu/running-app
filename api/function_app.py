import json
import os
import ssl
import logging
import urllib.request
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta

import azure.functions as func
import pg8000.dbapi

logger = logging.getLogger("running-app")


def log_request(_logger):
    def _dec(f):
        return f
    return _dec

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def get_conn():
    url = urlparse(os.environ["DATABASE_URL"])
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    conn = pg8000.dbapi.connect(
        host=url.hostname,
        database=url.path.lstrip("/"),
        user=url.username,
        password=url.password,
        port=url.port or 5432,
        ssl_context=ssl_ctx,
    )
    return conn


def _row(cur, row):
    return {d[0]: v for d, v in zip(cur.description, row)} if row else None


def _rows(cur):
    return [{d[0]: v for d, v in zip(cur.description, row)} for row in cur.fetchall()]


def json_response(data, status=200):
    return func.HttpResponse(
        json.dumps(data, default=str),
        status_code=status,
        mimetype="application/json",
    )


def err(msg, status=400):
    return func.HttpResponse(json.dumps({"error": msg}), status_code=status, mimetype="application/json")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def require_auth(req: func.HttpRequest):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            claims = json.loads(resp.read().decode())
        if claims.get("aud") != os.environ.get("GOOGLE_CLIENT_ID"):
            return None
        google_id = claims.get("sub")
        email = claims.get("email")
        display_name = claims.get("name") or email
        if not google_id or not email:
            return None
        return google_id, email, display_name
    except Exception:
        return None


def get_or_create_user(conn, google_id: str, email: str, display_name: str) -> dict:
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE google_id = %s", (google_id,))
    row = _row(cur, cur.fetchone())
    if row:
        cur.close()
        return row
    cur.execute(
        "INSERT INTO users (google_id, email, display_name) VALUES (%s, %s, %s) RETURNING *",
        (google_id, email, display_name),
    )
    conn.commit()
    row = _row(cur, cur.fetchone())
    cur.close()
    return row


# ---------------------------------------------------------------------------
# Badge logic
# ---------------------------------------------------------------------------

BADGE_RULES = [
    ("5k",  lambda dist: dist >= 5000),
    ("10k", lambda dist: dist >= 10000),
    ("21k", lambda dist: dist >= 21097),
    ("42k", lambda dist: dist >= 42195),
]


def compute_and_upsert_badges(conn, user_id: str, run_id: str, distance_meters: float) -> list[str]:
    earned = []
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS cnt FROM runs WHERE user_id = %s", (user_id,))
    if cur.fetchone()[0] == 1:
        cur.execute(
            "INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, 'first_run', %s) ON CONFLICT DO NOTHING RETURNING badge_type",
            (user_id, run_id),
        )
        if cur.fetchone():
            earned.append("first_run")

    for badge_type, check in BADGE_RULES:
        if check(distance_meters):
            cur.execute(
                "INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING badge_type",
                (user_id, badge_type, run_id),
            )
            if cur.fetchone():
                earned.append(badge_type)

    cur.execute(
        "SELECT DISTINCT DATE(started_at AT TIME ZONE 'UTC') AS run_date FROM runs WHERE user_id = %s ORDER BY run_date DESC LIMIT 7",
        (user_id,),
    )
    dates = [r[0] for r in cur.fetchall()]
    if len(dates) >= 7:
        today = datetime.now(timezone.utc).date()
        streak = all((today - timedelta(days=i)) in dates for i in range(7))
        if streak:
            cur.execute(
                "INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, 'longest_streak', %s) ON CONFLICT DO NOTHING RETURNING badge_type",
                (user_id, run_id),
            )
            if cur.fetchone():
                earned.append("longest_streak")

    conn.commit()
    cur.close()
    return earned


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route(route="users/me", methods=["GET"])
@log_request(logger)
def get_me(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        conn.close()
        return json_response({"id": user["id"], "email": user["email"], "displayName": user["display_name"]})
    except Exception as e:
        logging.exception("get_me error")
        return err(str(e), 500)


@app.route(route="runs", methods=["GET"])
@log_request(logger)
def list_runs(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute(
            """SELECT id, started_at, ended_at, distance_meters, duration_seconds,
                      avg_pace_seconds_per_km, name
               FROM runs WHERE user_id = %s ORDER BY started_at DESC""",
            (user["id"],),
        )
        rows = _rows(cur)
        cur.close()
        conn.close()
        return json_response(rows)
    except Exception as e:
        logging.exception("list_runs error")
        return err(str(e), 500)


@app.route(route="runs/bests", methods=["GET"])
@log_request(logger)
def get_bests(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute(
            """SELECT COUNT(*) AS total_runs,
                      COALESCE(SUM(distance_meters) / 1000.0, 0) AS total_km,
                      MIN(avg_pace_seconds_per_km) AS best_pace_seconds_per_km,
                      MAX(distance_meters) AS longest_run_meters
               FROM runs WHERE user_id = %s""",
            (user["id"],),
        )
        row = _row(cur, cur.fetchone())
        cur.close()
        conn.close()
        return json_response(row)
    except Exception as e:
        logging.exception("get_bests error")
        return err(str(e), 500)


@app.route(route="runs", methods=["POST"])
@log_request(logger)
def create_run(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        body = req.get_json()
    except Exception:
        return err("Invalid JSON")

    distance = body.get("distance_meters", 0)
    duration = body.get("duration_seconds", 0)
    waypoints = body.get("waypoints", [])
    name = body.get("name")

    if distance <= 0 or duration <= 0:
        return err("distance_meters and duration_seconds required")

    avg_pace = duration / (distance / 1000) if distance > 0 else None
    now = datetime.now(timezone.utc)
    started_at = now - timedelta(seconds=duration)

    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO runs (user_id, started_at, ended_at, distance_meters, duration_seconds,
                                 avg_pace_seconds_per_km, name, waypoints)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (user["id"], started_at, now, distance, duration, avg_pace, name, json.dumps(waypoints)),
        )
        run = _row(cur, cur.fetchone())
        conn.commit()
        cur.close()
        badges_earned = compute_and_upsert_badges(conn, user["id"], run["id"], distance)
        run["badges_earned"] = badges_earned
        run["waypoints"] = waypoints
        conn.close()
        return json_response(run, 201)
    except Exception as e:
        logging.exception("create_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["GET"])
@log_request(logger)
def get_run(req: func.HttpRequest, run_id: str) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute("SELECT * FROM runs WHERE id = %s AND user_id = %s", (run_id, user["id"]))
        run = _row(cur, cur.fetchone())
        if not run:
            cur.close()
            conn.close()
            return err("Not found", 404)
        cur.execute("SELECT badge_type FROM badges WHERE run_id = %s", (run_id,))
        run["badges_earned"] = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        return json_response(run)
    except Exception as e:
        logging.exception("get_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["DELETE"])
@log_request(logger)
def delete_run(req: func.HttpRequest, run_id: str) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute("DELETE FROM runs WHERE id = %s AND user_id = %s RETURNING id", (run_id, user["id"]))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return err("Not found", 404)
        conn.commit()
        cur.close()
        conn.close()
        return func.HttpResponse(status_code=204)
    except Exception as e:
        logging.exception("delete_run error")
        return err(str(e), 500)


@app.route(route="badges", methods=["GET"])
@log_request(logger)
def list_badges(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute(
            "SELECT badge_type, earned_at, run_id FROM badges WHERE user_id = %s ORDER BY earned_at",
            (user["id"],),
        )
        rows = _rows(cur)
        cur.close()
        conn.close()
        return json_response(rows)
    except Exception as e:
        logging.exception("list_badges error")
        return err(str(e), 500)
