import json
import math
import os
import ssl
import time
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


def _maybe_json(value):
    if isinstance(value, (dict, list)) or value is None:
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


def _haversine_m(a, b):
    R = 6371000
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lng"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lng"])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


WEATHER_CODE_MAP = {
    0: ("Clear", "clear"),
    1: ("Mainly clear", "clear"),
    2: ("Partly cloudy", "cloudy"),
    3: ("Overcast", "cloudy"),
    45: ("Fog", "cloudy"),
    48: ("Fog", "cloudy"),
    51: ("Light drizzle", "rain"),
    53: ("Drizzle", "rain"),
    55: ("Heavy drizzle", "rain"),
    61: ("Light rain", "rain"),
    63: ("Rain", "rain"),
    65: ("Heavy rain", "rain"),
    66: ("Freezing rain", "rain"),
    67: ("Freezing rain", "rain"),
    71: ("Light snow", "snow"),
    73: ("Snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Rain showers", "rain"),
    81: ("Rain showers", "rain"),
    82: ("Violent rain showers", "rain"),
    85: ("Snow showers", "snow"),
    86: ("Snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm with hail", "storm"),
    99: ("Thunderstorm with hail", "storm"),
}


def weather_code_to_condition(code):
    return WEATHER_CODE_MAP.get(code, ("Unknown", "cloudy"))


def downsample_waypoints(waypoints, max_points=16):
    if len(waypoints) <= max_points:
        return [{"lat": w["lat"], "lng": w["lng"]} for w in waypoints]
    step = (len(waypoints) - 1) / (max_points - 1)
    indices = sorted(set(round(i * step) for i in range(max_points)))
    if indices[-1] != len(waypoints) - 1:
        indices[-1] = len(waypoints) - 1
    return [{"lat": waypoints[i]["lat"], "lng": waypoints[i]["lng"]} for i in indices]


ROUTE_ENDPOINT_THRESHOLD_M = 150
ROUTE_RETRACE_THRESHOLD_M = 40


def classify_route_shape(waypoints):
    if len(waypoints) < 4:
        return "point_to_point"
    start, end = waypoints[0], waypoints[-1]
    if _haversine_m(start, end) > ROUTE_ENDPOINT_THRESHOLD_M:
        return "point_to_point"
    mid = len(waypoints) // 2
    first_half = waypoints[:mid]
    second_half = list(reversed(waypoints[mid:]))
    n = min(len(first_half), len(second_half))
    if n == 0:
        return "loop"
    avg_gap = sum(_haversine_m(first_half[i], second_half[i]) for i in range(n)) / n
    return "out_and_back" if avg_gap < ROUTE_RETRACE_THRESHOLD_M else "loop"


def fetch_weather(lat, lng, started_at):
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        "&hourly=temperature_2m,weathercode"
        "&past_days=1&forecast_days=1&temperature_unit=fahrenheit&timezone=UTC"
    )
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        times = data["hourly"]["time"]
        temps = data["hourly"]["temperature_2m"]
        codes = data["hourly"]["weathercode"]
        target_str = started_at.strftime("%Y-%m-%dT%H:00")
        if target_str in times:
            idx = times.index(target_str)
        else:
            target_naive = started_at.replace(tzinfo=None)
            idx = min(
                range(len(times)),
                key=lambda i: abs(datetime.fromisoformat(times[i]) - target_naive),
            )
        condition, icon = weather_code_to_condition(codes[idx])
        return {"temp_f": round(temps[idx]), "condition": condition, "icon": icon}
    except Exception:
        logging.exception("fetch_weather failed")
        return None


def reverse_geocode_place(lat, lng):
    url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat={lat}&lon={lng}"
    req = urllib.request.Request(url, headers={"User-Agent": "running-app/1.0 (personal project)"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        logging.exception("reverse_geocode_place failed")
        return None
    addr = data.get("address", {})
    return addr.get("suburb") or addr.get("neighbourhood") or addr.get("residential") or addr.get("road")


def build_route_summary(waypoints):
    if len(waypoints) < 2:
        return "Run"
    try:
        shape = classify_route_shape(waypoints)
        n = len(waypoints)
        sample_indices = [0, n // 2, n - 1]
        places = []
        for i, idx in enumerate(sample_indices):
            if i > 0:
                time.sleep(1)  # Nominatim usage policy: max 1 request/second
            place = reverse_geocode_place(waypoints[idx]["lat"], waypoints[idx]["lng"])
            if place and (not places or places[-1] != place):
                places.append(place)
        if shape == "point_to_point":
            if len(places) >= 2:
                return f"From {places[0]} to {places[-1]}"
            return "Run"
        if not places:
            return "Run"
        verb = "Up and back" if shape == "out_and_back" else "Loop"
        if len(places) == 1:
            return f"{verb} through {places[0]}"
        return f"{verb} through {places[0]} and {places[-1]}"
    except Exception:
        logging.exception("build_route_summary failed")
        return "Run"


def require_auth(req: func.HttpRequest):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        with urllib.request.urlopen(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}", timeout=5) as resp:
            claims = json.loads(resp.read().decode())
        allowed_client_ids = {
            c.strip() for c in os.environ.get("GOOGLE_CLIENT_ID", "").split(",") if c.strip()
        }
        if claims.get("aud") not in allowed_client_ids:
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
                earned.append("longest_streak")
    conn.commit()
    cur.close()
    return earned


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
        cur = conn.cursor()
        cur.execute(
            "SELECT id, started_at, ended_at, distance_meters, duration_seconds, avg_pace_seconds_per_km, "
            "name, route_summary, weather_json, route_thumbnail FROM runs WHERE user_id = %s ORDER BY started_at DESC",
            (user["id"],),
        )
        rows = _rows(cur)
        for row in rows:
            row["weather_json"] = _maybe_json(row["weather_json"])
            row["route_thumbnail"] = _maybe_json(row["route_thumbnail"])
        cur.close()
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
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) AS total_runs, COALESCE(SUM(distance_meters)/1000.0,0) AS total_km, MIN(avg_pace_seconds_per_km) AS best_pace_seconds_per_km, MAX(distance_meters) AS longest_run_meters FROM runs WHERE user_id = %s", (user["id"],))
        row = _row(cur, cur.fetchone())
        cur.close()
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

    weather_data = None
    route_summary = "Run"
    route_thumbnail = []
    if len(waypoints) >= 1:
        route_thumbnail = downsample_waypoints(waypoints)
        try:
            weather_data = fetch_weather(waypoints[0]["lat"], waypoints[0]["lng"], started_at)
        except Exception:
            logging.exception("weather enrichment failed")
            weather_data = None
        try:
            route_summary = build_route_summary(waypoints)
        except Exception:
            logging.exception("route summary enrichment failed")
            route_summary = "Run"

    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO runs (user_id, started_at, ended_at, distance_meters, duration_seconds, "
            "avg_pace_seconds_per_km, name, waypoints, weather_json, route_summary, route_thumbnail) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (user["id"], started_at, now, distance, duration, avg_pace, name, json.dumps(waypoints),
             json.dumps(weather_data) if weather_data else None, route_summary, json.dumps(route_thumbnail)),
        )
        run = _row(cur, cur.fetchone())
        conn.commit()
        cur.close()
        badges_earned = compute_and_upsert_badges(conn, user["id"], run["id"], distance)
        run["badges_earned"] = badges_earned
        run["waypoints"] = waypoints
        run["weather_json"] = weather_data
        run["route_summary"] = route_summary
        run["route_thumbnail"] = route_thumbnail
        run["note"] = None
        conn.close()
        return json_response(run, 201)
    except Exception as e:
        logging.exception("create_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["GET"])
def get_run(req: func.HttpRequest) -> func.HttpResponse:
    run_id = req.route_params.get("run_id")
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
        run["weather_json"] = _maybe_json(run["weather_json"])
        run["route_thumbnail"] = _maybe_json(run["route_thumbnail"])
        cur.execute("SELECT badge_type FROM badges WHERE run_id = %s", (run_id,))
        run["badges_earned"] = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        return json_response(run)
    except Exception as e:
        logging.exception("get_run error")
        return err(str(e), 500)


@app.route(route="runs/{run_id}", methods=["DELETE"])
def delete_run(req: func.HttpRequest) -> func.HttpResponse:
    run_id = req.route_params.get("run_id")
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
def list_badges(req: func.HttpRequest) -> func.HttpResponse:
    identity = require_auth(req)
    if not identity:
        return err("Unauthorized", 401)
    google_id, email, display_name = identity
    try:
        conn = get_conn()
        user = get_or_create_user(conn, google_id, email, display_name)
        cur = conn.cursor()
        cur.execute("SELECT badge_type, earned_at, run_id FROM badges WHERE user_id = %s ORDER BY earned_at", (user["id"],))
        rows = _rows(cur)
        cur.close()
        conn.close()
        return json_response(rows)
    except Exception as e:
        logging.exception("list_badges error")
        return err(str(e), 500)
