import json
import os
import ssl
import logging
import urllib.request
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta

import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


@app.route(route="health")
def health(req: func.HttpRequest) -> func.HttpResponse:
    import sys
    diag = {}
    try:
        import pg8000.dbapi  # noqa: F401
    except Exception as e:
        diag["pg8000"] = str(e)
    return func.HttpResponse(
        json.dumps({"errors": diag, "sys_path": sys.path[:8]}),
        status_code=200,
        mimetype="application/json",
    )


def get_conn():
    import pg8000.dbapi
    url = urlparse(os.environ["DATABASE_URL"])
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    return pg8000.dbapi.connect(
        host=url.hostname, database=url.path.lstrip("/"),
        user=url.username, password=url.password,
        port=url.port or 5432, ssl_context=ssl_ctx,
    )


def _row(cur, row):
    return {d[0]: v for d, v in zip(cur.description, row)} if row else None


def _rows(cur):
    return [{d[0]: v for d, v in zip(cur.description, row)} for row in cur.fetchall()]


def json_response(data, status=200):
    return func.HttpResponse(json.dumps(data, default=str), status_code=status, mimetype="application/json")


def err(msg, status=400):
    return func.HttpResponse(json.dumps({"error": msg}), status_code=status, mimetype="application/json")


def require_auth(req: func.HttpRequest):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        with urllib.request.urlopen(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}", timeout=5) as resp:
            claims = json.loads(resp.read().decode())
        if claims.get("aud") != os.environ.get("GOOGLE_CLIENT_ID"):
            return None
        google_id, email = claims.get("sub"), claims.get("email")
        display_name = claims.get("name") or email
        if not google_id or not email:
            return None
        return google_id, email, display_name
    except Exception:
        return None


def get_or_create_user(conn, google_id, email, display_name):
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE google_id = %s", (google_id,))
    row = _row(cur, cur.fetchone())
    if row:
        cur.close()
        return row
    cur.execute("INSERT INTO users (google_id, email, display_name) VALUES (%s, %s, %s) RETURNING *",
                (google_id, email, display_name))
    conn.commit()
    row = _row(cur, cur.fetchone())
    cur.close()
    return row

# ========= SESSION DATA STRUCTURE SUPPORT =========

@app.route(route="run_sessions", methods=["GET", "POST"])
def run_sessions_handler(req: func.HttpRequest) -> func.HttpResponse:
    creds = require_auth(req)
    if not creds:
        return err("Auth required", 401)
    google_id, email, display_name = creds
    conn = get_conn()
    user = get_or_create_user(conn, google_id, email, display_name)
    user_id = user['id']
    if req.method == "GET":
        cur = conn.cursor()
        cur.execute("""
            SELECT s.*, COALESCE(json_agg(r.*) FILTER (WHERE r.id IS NOT NULL), '[]') as runs
            FROM run_sessions s
            LEFT JOIN runs r ON r.session_id = s.id
            WHERE s.user_id = %s
            GROUP BY s.id
            ORDER BY s.started_at DESC
        """, (user_id,))
        sessions = []
        for row in cur.fetchall():
            sess = dict(zip([d[0] for d in cur.description], row))
            if isinstance(sess['runs'], str):
                sess['runs'] = json.loads(sess['runs'])
            sessions.append(sess)
        cur.close()
        conn.close()
        return json_response(sessions)
    if req.method == "POST":
        data = json.loads(req.get_body())
        started_at = data['started_at']
        ended_at = data['ended_at']
        name = data.get('name')
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO run_sessions (user_id, started_at, ended_at, name)
            VALUES (%s, %s, %s, %s)
            RETURNING *
        """, (user_id, started_at, ended_at, name))
        session = _row(cur, cur.fetchone())
        conn.commit()
        cur.close()
        conn.close()
        return json_response(session, 201)
    return err("Unsupported method", 405)

@app.route(route="runs", methods=["GET", "POST"])
def runs_handler(req: func.HttpRequest) -> func.HttpResponse:
    creds = require_auth(req)
    if not creds:
        return err("Auth required", 401)
    google_id, email, display_name = creds
    conn = get_conn()
    user = get_or_create_user(conn, google_id, email, display_name)
    user_id = user['id']
    if req.method == "GET":
        session_id = req.params.get('session_id')
        cur = conn.cursor()
        if session_id:
            cur.execute("SELECT * FROM runs WHERE user_id = %s AND session_id = %s ORDER BY started_at ASC", (user_id, session_id))
            runs = _rows(cur)
        else:
            cur.execute("SELECT * FROM runs WHERE user_id = %s ORDER BY started_at DESC", (user_id,))
            runs = _rows(cur)
        cur.close()
        conn.close()
        return json_response(runs)
    if req.method == "POST":
        data = json.loads(req.get_body())
        session_id = data.get('session_id')  # Can be None for legacy
        started_at = data['started_at']
        ended_at = data['ended_at']
        distance_m = float(data['distance_meters'])
        duration = int(data['duration_seconds'])
        avg_pace = float(data.get('avg_pace_seconds_per_km') or 0.0)
        name = data.get('name')
        waypoints = json.dumps(data.get('waypoints', []))
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO runs (
                session_id, user_id, started_at, ended_at,
                distance_meters, duration_seconds, avg_pace_seconds_per_km,
                name, waypoints
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            session_id, user_id, started_at, ended_at, distance_m, duration,
            avg_pace if avg_pace > 0 else None, name, waypoints
        ))
        run = _row(cur, cur.fetchone())
        compute_and_upsert_badges(conn, user_id, run['id'], run['distance_meters'])
        conn.commit()
        cur.close()
        conn.close()
        return json_response(run, 201)
    return err("Unsupported method", 405)

@app.route(route="run_sessions/{session_id}", methods=["GET"])
def single_run_session(req: func.HttpRequest) -> func.HttpResponse:
    creds = require_auth(req)
    if not creds:
        return err("Auth required", 401)
    google_id, email, display_name = creds
    conn = get_conn()
    user = get_or_create_user(conn, google_id, email, display_name)
    user_id = user['id']
    session_id = req.route_params['session_id']
    cur = conn.cursor()
    cur.execute("""
        SELECT s.*, COALESCE(json_agg(r.*) FILTER (WHERE r.id IS NOT NULL), '[]') as runs
        FROM run_sessions s
        LEFT JOIN runs r ON r.session_id = s.id
        WHERE s.user_id = %s AND s.id = %s
        GROUP BY s.id
    """, (user_id, session_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return err("Session not found", 404)
    sess = dict(zip([d[0] for d in cur.description], row))
    if isinstance(sess['runs'], str):
        sess['runs'] = json.loads(sess['runs'])
    cur.close()
    conn.close()
    return json_response(sess)

# ... (rest of unchanged features: users, bests, badges, single run operations remain)

BADGE_RULES = [("5k", 5000), ("10k", 10000), ("21k", 21097), ("42k", 42195)]

def compute_and_upsert_badges(conn, user_id, run_id, distance_meters):
    earned = []
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM runs WHERE user_id = %s", (user_id,))
    if cur.fetchone()[0] == 1:
        cur.execute("INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, 'first_run', %s) ON CONFLICT DO NOTHING RETURNING badge_type", (user_id, run_id))
        if cur.fetchone():
            earned.append("first_run")
    for badge_type, threshold in BADGE_RULES:
        if distance_meters >= threshold:
            cur.execute("INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING badge_type", (user_id, badge_type, run_id))
            if cur.fetchone():
                earned.append(badge_type)
    cur.execute("SELECT DISTINCT DATE(started_at AT TIME ZONE 'UTC') AS run_date FROM runs WHERE user_id = %s ORDER BY run_date DESC LIMIT 7", (user_id,))
    dates = [r[0] for r in cur.fetchall()]
    if len(dates) >= 7:
        today = datetime.now(timezone.utc).date()
        if all((today - timedelta(days=i)) in dates for i in range(7)):
            cur.execute("INSERT INTO badges (user_id, badge_type, run_id) VALUES (%s, 'longest_streak', %s) ON CONFLICT DO NOTHING RETURNING badge_type", (user_id, run_id))
            if cur.fetchone():
                earned.append('longest_streak')
    cur.close()
    return earned
