import json
import os
import base64
import logging
import urllib.request
from datetime import datetime, timezone, timedelta

import azure.functions as func
import psycopg2
import psycopg2.extras

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)


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
    """Return (google_id, email, display_name) from Google Bearer JWT, or None."""
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        # Verify via Google tokeninfo endpoint (simple, no key management needed)
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
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM users WHERE google_id = %s", (google_id,))
        row = cur.fetchone()
        if row:
            return dict(row)
        cur.execute(
            "INSERT INTO users (google_id, email, display_name) VALUES (%s, %s, %s) RETURNING *",
            (google_id, email, display_name),
        )
        conn.commit()
        return dict(cur.fetchone())


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
    with conn.cursor() as cur:
        # first_run badge
        cur.execute("SELECT COUNT(*) AS cnt FROM runs WHERE user_id = %s", (user_id,))
        if cur.fetchone()["cnt"] == 1:
            cur.execute(
                "INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, 'first_run', %s) ON CONFLICT DO NOTHING RETURNING badge_type",
                (user_id, run_id),
            )
            if cur.fetchone():
                earned.append("first_run")

        # distance badges
        for badge_type, check in BADGE_RULES:
            if check(distance_meters):
                cur.execute(
                    "INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING badge_type",
                    (user_id, badge_type, run_id),
                )
                if cur.fetchone():
                    earned.append(badge_type)

        # 7-day streak badge
        cur.execute(
            "SELECT DISTINCT DATE(started_at AT TIME ZONE 'UTC') AS run_date FROM runs WHERE user_id = %s ORDER BY run_date DESC LIMIT 7",
            (user_id,),
        )
        dates = [r["run_date"] for r in cur.fetchall()]
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
    return earned


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route(route="users/me", methods=["GET"])
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
def list_runs(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, started_at, ended_at, distance_meters, duration_seconds,
                          avg_pace_seconds_per_km, name
                   FROM runs WHERE user_id = %s ORDER BY started_at DESC""",
                (user["id"],),
            )
            rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return json_response(rows)
    except Exception as e:
        logging.exception("list_runs error")
        return err(str(e), 500)


@app.route(route="runs/bests", methods=["GET"])
def get_bests(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COUNT(*) AS total_runs,
                          COALESCE(SUM(distance_meters) / 1000.0, 0) AS total_km,
                          MIN(avg_pace_seconds_per_km) AS best_pace_seconds_per_km,
                          MAX(distance_meters) AS longest_run_meters
                   FROM runs WHERE user_id = %s""",
                (user["id"],),
            )
            row = dict(cur.fetchone())
        conn.close()
        return json_response(row)
    except Exception as e:
        logging.exception("get_bests error")
        return err(str(e), 500)


@app.route(route="runs", methods=["POST"])
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
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO runs (user_id, started_at, ended_at, distance_meters, duration_seconds,
                                     avg_pace_seconds_per_km, name, waypoints)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (user["id"], started_at, now, distance, duration, avg_pace, name, json.dumps(waypoints)),
            )
            run = dict(cur.fetchone())
            conn.commit()

        badges_earned = compute_and_upsert_badges(conn, user["id"], run["id"], distance)
        run["badges_earned"] = badges_earned
        run["waypoints"] = waypoints
        conn.close()
        return json_response(run, 201)
    except Exception as e:
        logging.exception("create_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["GET"])
def get_run(req: func.HttpRequest, run_id: str) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, _, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, identity[1], display_name)
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM runs WHERE id = %s AND user_id = %s", (run_id, user["id"]))
            row = cur.fetchone()
            if not row:
                conn.close()
                return err("Not found", 404)
            run = dict(row)
            cur.execute("SELECT badge_type FROM badges WHERE run_id = %s", (run_id,))
            run["badges_earned"] = [r["badge_type"] for r in cur.fetchall()]
        conn.close()
        return json_response(run)
    except Exception as e:
        logging.exception("get_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["DELETE"])
def delete_run(req: func.HttpRequest, run_id: str) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM runs WHERE id = %s AND user_id = %s RETURNING id", (run_id, user["id"]))
            if not cur.fetchone():
                conn.close()
                return err("Not found", 404)
            conn.commit()
        conn.close()
        return func.HttpResponse(status_code=204)
    except Exception as e:
        logging.exception("delete_run error")
        return err(str(e), 500)


@app.route(route="badges", methods=["GET"])
def list_badges(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT badge_type, earned_at, run_id FROM badges WHERE user_id = %s ORDER BY earned_at",
                (user["id"],),
            )
            rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return json_response(rows)
    except Exception as e:
        logging.exception("list_badges error")
        return err(str(e), 500)
