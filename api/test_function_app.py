import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import function_app
from function_app import (
    weather_code_to_condition,
    downsample_waypoints,
    classify_route_shape,
    _haversine_m,
    fetch_weather,
    reverse_geocode_place,
    build_route_summary,
    _maybe_json,
    parse_run_feel_fields,
    parse_gear_fields,
    ValidationError,
)


def wp(lat, lng):
    return {"lat": lat, "lng": lng, "ts": 0}


class TestWeatherCodeMapping(unittest.TestCase):
    def test_clear_sky(self):
        condition, icon = weather_code_to_condition(0)
        self.assertEqual(condition, "Clear")
        self.assertEqual(icon, "clear")

    def test_rain_code(self):
        condition, icon = weather_code_to_condition(61)
        self.assertEqual(icon, "rain")

    def test_freezing_drizzle_codes(self):
        self.assertEqual(weather_code_to_condition(56), ("Light freezing drizzle", "rain"))
        self.assertEqual(weather_code_to_condition(57), ("Freezing drizzle", "rain"))

    def test_thunderstorm_code(self):
        condition, icon = weather_code_to_condition(95)
        self.assertEqual(icon, "storm")

    def test_unknown_code_falls_back(self):
        condition, icon = weather_code_to_condition(999)
        self.assertEqual(condition, "Unknown")
        self.assertEqual(icon, "cloudy")


class TestHaversine(unittest.TestCase):
    def test_same_point_is_zero(self):
        p = wp(47.65, -122.32)
        self.assertAlmostEqual(_haversine_m(p, p), 0.0, delta=0.01)

    def test_known_distance(self):
        # Roughly 1 degree of latitude ~= 111,000 meters
        a = wp(0.0, 0.0)
        b = wp(1.0, 0.0)
        self.assertAlmostEqual(_haversine_m(a, b), 111195, delta=500)


class TestDownsampleWaypoints(unittest.TestCase):
    def test_returns_all_points_when_under_limit(self):
        points = [wp(i * 0.001, 0) for i in range(10)]
        result = downsample_waypoints(points, max_points=16)
        self.assertEqual(len(result), 10)
        self.assertEqual(result[0], {"lat": 0.0, "lng": 0})

    def test_downsamples_to_max_points(self):
        points = [wp(i * 0.0001, 0) for i in range(500)]
        result = downsample_waypoints(points, max_points=16)
        self.assertLessEqual(len(result), 16)
        self.assertGreater(len(result), 1)

    def test_always_includes_first_and_last(self):
        points = [wp(i * 0.0001, 0) for i in range(500)]
        result = downsample_waypoints(points, max_points=16)
        self.assertEqual(result[0], {"lat": points[0]["lat"], "lng": points[0]["lng"]})
        self.assertEqual(result[-1], {"lat": points[-1]["lat"], "lng": points[-1]["lng"]})

    def test_output_only_has_lat_lng_keys(self):
        points = [wp(0, 0), wp(0.001, 0.001)]
        result = downsample_waypoints(points, max_points=16)
        for point in result:
            self.assertEqual(set(point.keys()), {"lat", "lng"})


def out_and_back_path():
    # Straight out, then straight back along the same line.
    out = [wp(i * 0.001, 0) for i in range(20)]
    back = [wp(i * 0.001, 0) for i in range(19, -1, -1)]
    return out + back


def loop_path():
    import math
    points = []
    for i in range(41):  # 0..40 inclusive so the last point closes the circle back to the start
        angle = 2 * math.pi * i / 40
        points.append(wp(0.01 * math.cos(angle), 0.01 * math.sin(angle)))
    return points


def point_to_point_path():
    return [wp(i * 0.001, 0) for i in range(20)]


class TestClassifyRouteShape(unittest.TestCase):
    def test_out_and_back(self):
        self.assertEqual(classify_route_shape(out_and_back_path()), "out_and_back")

    def test_loop(self):
        self.assertEqual(classify_route_shape(loop_path()), "loop")

    def test_point_to_point(self):
        self.assertEqual(classify_route_shape(point_to_point_path()), "point_to_point")

    def test_too_short_is_point_to_point(self):
        self.assertEqual(classify_route_shape([wp(0, 0), wp(0.001, 0.001)]), "point_to_point")


class TestFetchWeather(unittest.TestCase):
    @patch("function_app.urllib.request.urlopen")
    def test_picks_hour_closest_to_started_at(self, mock_urlopen):
        payload = json.dumps({
            "hourly": {
                "time": ["2026-08-24T06:00", "2026-08-24T07:00", "2026-08-24T08:00"],
                "temperature_2m": [60.0, 68.0, 74.0],
                "weathercode": [1, 2, 3],
            }
        }).encode()
        mock_urlopen.return_value.__enter__.return_value.read.return_value = payload
        started_at = datetime(2026, 8, 24, 7, 12, tzinfo=timezone.utc)
        result = fetch_weather(47.65, -122.32, started_at)
        self.assertEqual(result, {"temp_f": 68, "condition": "Partly cloudy", "icon": "cloudy"})

    @patch("function_app.urllib.request.urlopen", side_effect=Exception("timeout"))
    def test_returns_none_on_failure(self, mock_urlopen):
        result = fetch_weather(47.65, -122.32, datetime.now(timezone.utc))
        self.assertIsNone(result)


class TestReverseGeocodePlace(unittest.TestCase):
    @patch("function_app.urllib.request.urlopen")
    def test_prefers_suburb(self, mock_urlopen):
        payload = json.dumps({"address": {"suburb": "Eastlake", "road": "Fairview Ave"}}).encode()
        mock_urlopen.return_value.__enter__.return_value.read.return_value = payload
        self.assertEqual(reverse_geocode_place(47.65, -122.32), "Eastlake")

    @patch("function_app.urllib.request.urlopen")
    def test_falls_back_to_road(self, mock_urlopen):
        payload = json.dumps({"address": {"road": "Fairview Ave"}}).encode()
        mock_urlopen.return_value.__enter__.return_value.read.return_value = payload
        self.assertEqual(reverse_geocode_place(47.65, -122.32), "Fairview Ave")

    @patch("function_app.urllib.request.urlopen", side_effect=Exception("timeout"))
    def test_returns_none_on_failure(self, mock_urlopen):
        self.assertIsNone(reverse_geocode_place(47.65, -122.32))


class TestBuildRouteSummary(unittest.TestCase):
    @patch("function_app.time.sleep")
    @patch("function_app.reverse_geocode_place", return_value="Eastlake")
    def test_out_and_back_single_place(self, mock_geocode, mock_sleep):
        result = build_route_summary(out_and_back_path())
        self.assertEqual(result, "Up and back through Eastlake")

    @patch("function_app.time.sleep")
    @patch("function_app.reverse_geocode_place", side_effect=["Fremont", "Fremont", "Wallingford"])
    def test_loop_two_places(self, mock_geocode, mock_sleep):
        result = build_route_summary(loop_path())
        self.assertEqual(result, "Loop through Fremont and Wallingford")

    @patch("function_app.time.sleep")
    @patch("function_app.reverse_geocode_place", side_effect=["Ballard", "Fremont", "Wallingford"])
    def test_point_to_point(self, mock_geocode, mock_sleep):
        result = build_route_summary(point_to_point_path())
        self.assertEqual(result, "From Ballard to Wallingford")

    @patch("function_app.time.sleep")
    @patch("function_app.reverse_geocode_place", return_value=None)
    def test_falls_back_to_run_when_geocoding_fails(self, mock_geocode, mock_sleep):
        result = build_route_summary(out_and_back_path())
        self.assertEqual(result, "Run")

    def test_falls_back_to_run_for_too_few_waypoints(self):
        result = build_route_summary([wp(0, 0)])
        self.assertEqual(result, "Run")


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._last_row = None

    def execute(self, query, params=None):
        if query.startswith("INSERT INTO runs"):
            self._last_row = self.conn.inserted_row
            self.conn.last_insert_params = params
        elif query.startswith("SELECT COUNT(*) FROM runs"):
            self._last_row = (1,)
        elif query.startswith("SELECT DISTINCT DATE"):
            self._last_row = None
        else:
            self._last_row = None

    def fetchone(self):
        return self._last_row

    def fetchall(self):
        return []

    @property
    def description(self):
        return [(k,) for k in self.conn.inserted_row_keys]

    def close(self):
        pass


class FakeConn:
    def __init__(self, inserted_row_keys, inserted_row):
        self.inserted_row_keys = inserted_row_keys
        self.inserted_row = inserted_row
        self.last_insert_params = None

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def close(self):
        pass


class TestCreateRunEnrichment(unittest.TestCase):
    def _make_request(self, body):
        req = MagicMock()
        req.headers = {"Authorization": "Bearer faketoken"}
        req.get_json.return_value = body
        return req

    def _run_columns(self):
        return [
            "id", "user_id", "started_at", "ended_at", "distance_meters",
            "duration_seconds", "avg_pace_seconds_per_km", "name", "waypoints",
            "weather_json", "route_summary", "route_thumbnail", "note",
        ]

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.compute_and_upsert_badges", return_value=[])
    @patch("function_app.build_route_summary", return_value="Up and back through Eastlake")
    @patch("function_app.fetch_weather", return_value={"temp_f": 68, "condition": "Clear", "icon": "clear"})
    @patch("function_app.get_conn")
    def test_success_stores_enrichment_fields(
        self, mock_get_conn, mock_fetch_weather, mock_build_summary,
        mock_badges, mock_get_user, mock_auth,
    ):
        waypoints = [{"lat": 47.65 + i * 0.0001, "lng": -122.32, "ts": i} for i in range(5)]
        columns = self._run_columns()
        row_values = ["run-1", "user-1", None, None, 1000, 300, 300.0, None, waypoints,
                      None, None, None, None]
        mock_get_conn.return_value = FakeConn(columns, tuple(row_values))

        req = self._make_request({
            "distance_meters": 1000, "duration_seconds": 300, "waypoints": waypoints,
        })
        resp = function_app.create_run(req)

        self.assertEqual(resp.status_code, 201)
        body = json.loads(resp.get_body())
        self.assertEqual(body["route_summary"], "Up and back through Eastlake")
        self.assertEqual(body["weather_json"], {"temp_f": 68, "condition": "Clear", "icon": "clear"})
        self.assertEqual(body["route_thumbnail"], downsample_waypoints(waypoints))
        self.assertIsNone(body["note"])

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.compute_and_upsert_badges", return_value=[])
    @patch("function_app.build_route_summary", side_effect=Exception("geocoding down"))
    @patch("function_app.fetch_weather", side_effect=Exception("weather api down"))
    @patch("function_app.get_conn")
    def test_enrichment_failure_still_saves_run(
        self, mock_get_conn, mock_fetch_weather, mock_build_summary,
        mock_badges, mock_get_user, mock_auth,
    ):
        waypoints = [{"lat": 47.65, "lng": -122.32, "ts": 0}]
        columns = self._run_columns()
        row_values = ["run-1", "user-1", None, None, 1000, 300, 300.0, None, waypoints,
                      None, None, None, None]
        mock_get_conn.return_value = FakeConn(columns, tuple(row_values))

        req = self._make_request({
            "distance_meters": 1000, "duration_seconds": 300, "waypoints": waypoints,
        })
        resp = function_app.create_run(req)

        self.assertEqual(resp.status_code, 201)
        body = json.loads(resp.get_body())
        self.assertIsNone(body["weather_json"])
        self.assertEqual(body["route_summary"], "Run")

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.compute_and_upsert_badges", return_value=[])
    @patch("function_app.build_route_summary", return_value="Up and back through Eastlake")
    @patch("function_app.fetch_weather", return_value=None)
    @patch("function_app.get_conn")
    def test_name_is_derived_from_route_summary_ignoring_client_input(
        self, mock_get_conn, mock_fetch_weather, mock_build_summary,
        mock_badges, mock_get_user, mock_auth,
    ):
        waypoints = [{"lat": 47.65, "lng": -122.32, "ts": 0}]
        columns = self._run_columns()
        row_values = ["run-1", "user-1", None, None, 1000, 300, 300.0,
                      "Up and back through Eastlake", waypoints, None, None, None, None]
        conn = FakeConn(columns, tuple(row_values))
        mock_get_conn.return_value = conn

        req = self._make_request({
            "distance_meters": 1000, "duration_seconds": 300, "waypoints": waypoints,
            "name": "My Custom Name",
        })
        resp = function_app.create_run(req)

        self.assertEqual(resp.status_code, 201)
        body = json.loads(resp.get_body())
        self.assertEqual(body["route_summary"], "Up and back through Eastlake")
        # name column (index 6) must match route_summary column (index 9),
        # never the client-supplied "name" from the request body.
        self.assertEqual(conn.last_insert_params[6], "Up and back through Eastlake")
        self.assertEqual(conn.last_insert_params[6], conn.last_insert_params[9])


class TestMaybeJson(unittest.TestCase):
    def test_passes_through_dict(self):
        self.assertEqual(_maybe_json({"a": 1}), {"a": 1})

    def test_passes_through_list(self):
        self.assertEqual(_maybe_json([1, 2]), [1, 2])

    def test_passes_through_none(self):
        self.assertIsNone(_maybe_json(None))

    def test_decodes_json_string(self):
        self.assertEqual(_maybe_json('{"a": 1}'), {"a": 1})

    def test_leaves_non_json_string_alone(self):
        self.assertEqual(_maybe_json("Run"), "Run")


class FakeSelectCursor:
    def __init__(self, rows, columns):
        self.rows = rows
        self.columns = columns

    def execute(self, query, params=None):
        pass

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows

    @property
    def description(self):
        return [(c,) for c in self.columns]

    def close(self):
        pass


class FakeSelectConn:
    def __init__(self, rows, columns):
        self.rows = rows
        self.columns = columns

    def cursor(self):
        return FakeSelectCursor(self.rows, self.columns)

    def close(self):
        pass


class TestListRunsEnrichmentFields(unittest.TestCase):
    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.get_conn")
    def test_normalizes_json_string_columns(self, mock_get_conn, mock_get_user, mock_auth):
        columns = ["id", "started_at", "ended_at", "distance_meters", "duration_seconds",
                   "avg_pace_seconds_per_km", "name", "route_summary", "weather_json", "route_thumbnail"]
        row = ("run-1", None, None, 1000, 300, 300.0, None, "Up and back through Eastlake",
               '{"temp_f": 68, "condition": "Clear", "icon": "clear"}', '[{"lat": 1, "lng": 2}]')
        mock_get_conn.return_value = FakeSelectConn([row], columns)

        req = MagicMock()
        req.headers = {"Authorization": "Bearer faketoken"}
        resp = function_app.list_runs(req)

        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.get_body())
        self.assertEqual(body[0]["weather_json"], {"temp_f": 68, "condition": "Clear", "icon": "clear"})
        self.assertEqual(body[0]["route_thumbnail"], [{"lat": 1, "lng": 2}])
        self.assertEqual(body[0]["route_summary"], "Up and back through Eastlake")


class TestGetRunEnrichmentFields(unittest.TestCase):
    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.get_conn")
    def test_normalizes_json_string_columns(self, mock_get_conn, mock_get_user, mock_auth):
        columns = ["id", "user_id", "started_at", "ended_at", "distance_meters", "duration_seconds",
                   "avg_pace_seconds_per_km", "name", "waypoints", "weather_json", "route_summary",
                   "route_thumbnail", "note"]
        row = ("run-1", "user-1", None, None, 1000, 300, 300.0, None, "[]",
               '{"temp_f": 68, "condition": "Clear", "icon": "clear"}', "Run",
               '[{"lat": 1, "lng": 2}]', None)

        class FakeGetCursor(FakeSelectCursor):
            def __init__(self):
                super().__init__([row], columns)
                self._badges_queried = False

            def execute(self, query, params=None):
                self._badges_queried = query.startswith("SELECT badge_type")

            def fetchall(self):
                return [] if self._badges_queried else self.rows

        class FakeGetConn:
            def cursor(self):
                return FakeGetCursor()

            def close(self):
                pass

        mock_get_conn.return_value = FakeGetConn()

        req = MagicMock()
        req.headers = {"Authorization": "Bearer faketoken"}
        req.route_params = {"run_id": "run-1"}
        resp = function_app.get_run(req)

        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.get_body())
        self.assertEqual(body["weather_json"], {"temp_f": 68, "condition": "Clear", "icon": "clear"})
        self.assertEqual(body["route_thumbnail"], [{"lat": 1, "lng": 2}])
        self.assertEqual(body["badges_earned"], [])


class FakeUpdateCursor:
    def __init__(self, found):
        self.found = found
        self._last = None

    def execute(self, query, params=None):
        if query.startswith("UPDATE runs"):
            self._last = ("run-1", "user-1", "note text", None, None) if self.found else None
        else:
            self._last = None

    def fetchone(self):
        return self._last

    def fetchall(self):
        return []

    @property
    def description(self):
        # RETURNING * returns every column; only the ones update_run reads
        # (id, user_id, note, weather_json, route_thumbnail) matter here.
        return [("id",), ("user_id",), ("note",), ("weather_json",), ("route_thumbnail",)]

    def close(self):
        pass


class FakeUpdateConn:
    def __init__(self, found):
        self.found = found

    def cursor(self):
        return FakeUpdateCursor(self.found)

    def commit(self):
        pass

    def close(self):
        pass


class TestUpdateRun(unittest.TestCase):
    def _make_request(self, body):
        req = MagicMock()
        req.headers = {"Authorization": "Bearer faketoken"}
        req.route_params = {"run_id": "run-1"}
        req.get_json.return_value = body
        return req

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.get_conn")
    def test_updates_note(self, mock_get_conn, mock_get_user, mock_auth):
        mock_get_conn.return_value = FakeUpdateConn(found=True)
        req = self._make_request({"note": "note text"})
        resp = function_app.update_run(req)
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.get_body())
        self.assertEqual(body["note"], "note text")

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    @patch("function_app.get_or_create_user", return_value={"id": "user-1"})
    @patch("function_app.get_conn")
    def test_not_found_returns_404(self, mock_get_conn, mock_get_user, mock_auth):
        mock_get_conn.return_value = FakeUpdateConn(found=False)
        req = self._make_request({"note": "note text"})
        resp = function_app.update_run(req)
        self.assertEqual(resp.status_code, 404)

    @patch("function_app.require_auth", return_value=None)
    def test_unauthenticated_returns_401(self, mock_auth):
        req = self._make_request({"note": "x"})
        resp = function_app.update_run(req)
        self.assertEqual(resp.status_code, 401)

    @patch("function_app.require_auth", return_value=("gid", "e@x.com", "Name"))
    def test_missing_note_key_returns_400(self, mock_auth):
        req = self._make_request({})
        resp = function_app.update_run(req)
        self.assertEqual(resp.status_code, 400)



class TestParseRunFeelFields(unittest.TestCase):
    def test_full_body_is_normalized(self):
        fields = parse_run_feel_fields({
            "feel": 5,
            "body_tags": ["fresh_legs", "in_the_zone", "fresh_legs"],
            "weather_feel": ["just_right"],
            "music": {"kind": "album", "title": "  Currents ", "by": "Tame Impala", "helped": "pushed"},
            "mid_run_notes": [{"kind": "strong", "elapsed_s": 600}],
            "note": "  Clicked.  ",
            "gear": [{"gear_id": "ABC", "comfort": 3, "note": ""}],
        })
        self.assertEqual(fields["feel"], 5)
        self.assertEqual(fields["body_tags"], ["fresh_legs", "in_the_zone"])
        self.assertEqual(fields["music"], {"kind": "album", "title": "Currents", "by": "Tame Impala", "helped": "pushed"})
        self.assertEqual(fields["mid_run_notes"], [{"kind": "strong", "elapsed_s": 600}])
        self.assertEqual(fields["note"], "Clicked.")
        self.assertEqual(fields["gear"], [{"gear_id": "abc", "comfort": 3, "note": None}])

    def test_returns_only_keys_present(self):
        self.assertEqual(parse_run_feel_fields({"feel": 2}), {"feel": 2})
        self.assertEqual(parse_run_feel_fields({}), {})

    def test_null_feel_and_music_are_allowed(self):
        self.assertEqual(parse_run_feel_fields({"feel": None, "music": None}), {"feel": None, "music": None})

    def test_rejects_bad_values(self):
        bad_bodies = [
            {"feel": 0}, {"feel": 6}, {"feel": True}, {"feel": "5"}, {"feel": 4.5},
            {"body_tags": ["sore_everything"]}, {"body_tags": "fresh_legs"},
            {"weather_feel": ["balmy"]},
            {"music": {"kind": "radio"}}, {"music": {"kind": "album", "helped": "a lot"}},
            {"music": {"kind": "album", "title": "x" * 201}}, {"music": "album"},
            {"mid_run_notes": [{"kind": "bored", "elapsed_s": 1}]},
            {"mid_run_notes": [{"kind": "strong", "elapsed_s": -1}]},
            {"mid_run_notes": [{"kind": "strong", "elapsed_s": 1}] * 201},
            {"note": "x" * 2001}, {"note": 5},
            {"gear": [{"gear_id": "a", "comfort": 4}]}, {"gear": [{"gear_id": "a", "comfort": 0}]},
            {"gear": [{"gear_id": "a"}, {"gear_id": "A"}]}, {"gear": [{"comfort": 2}]},
            {"gear": [{"gear_id": str(i)} for i in range(21)]}, {"gear": {"gear_id": "a"}},
            {"gear": [{"gear_id": "a", "note": "x" * 501}]},
        ]
        for body in bad_bodies:
            with self.subTest(body=str(body)[:80]):
                with self.assertRaises(ValidationError):
                    parse_run_feel_fields(body)


class TestParseGearFields(unittest.TestCase):
    def test_create_requires_name_kind_color(self):
        self.assertEqual(
            parse_gear_fields({"name": " Pegasus ", "kind": "shoe", "color": "a1"}, partial=False),
            {"name": "Pegasus", "kind": "shoe", "color": "a1"},
        )
        for body in ({"kind": "shoe", "color": "a1"}, {"name": "x", "color": "a1"}, {"name": "x", "kind": "shoe"},
                     {"name": "  ", "kind": "shoe", "color": "a1"}, {"name": "x", "kind": "sock", "color": "a1"},
                     {"name": "x", "kind": "shoe", "color": "#ff0000"}, {"name": "x" * 81, "kind": "shoe", "color": "a1"}):
            with self.subTest(body=body):
                with self.assertRaises(ValidationError):
                    parse_gear_fields(body, partial=False)

    def test_create_ignores_retired(self):
        self.assertNotIn("retired", parse_gear_fields({"name": "x", "kind": "hat", "color": "a2", "retired": True}, partial=False))

    def test_partial_update(self):
        self.assertEqual(parse_gear_fields({"retired": True}, partial=True), {"retired": True})
        self.assertEqual(parse_gear_fields({"color": "a5"}, partial=True), {"color": "a5"})
        with self.assertRaises(ValidationError):
            parse_gear_fields({"retired": "yes"}, partial=True)


class ScriptedCursor:
    """Answers each query with the first scripted (substring, (columns, rows))
    match, and records every query so tests can assert on the SQL issued."""

    def __init__(self, conn):
        self.conn = conn
        self._cols, self._rows = [], []

    def execute(self, query, params=None):
        self.conn.queries.append((query, params))
        self._cols, self._rows = [], []
        for needle, result in self.conn.script:
            if needle in query:
                self._cols, rows = result
                self._rows = list(rows)
                break

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    @property
    def description(self):
        return [(c,) for c in self._cols]

    def close(self):
        pass


class ScriptedConn:
    def __init__(self, script):
        self.script = script
        self.queries = []
        self.commits = 0

    def cursor(self):
        return ScriptedCursor(self)

    def commit(self):
        self.commits += 1

    def close(self):
        pass

    def ran(self, needle):
        return [params for query, params in self.queries if needle in query]


def scripted_request(body=None, **route_params):
    req = MagicMock()
    req.headers = {"Authorization": "Bearer faketoken"}
    req.route_params = route_params
    req.get_json.return_value = body
    return req


RUN_COLUMNS = ["id", "user_id", "started_at", "ended_at", "distance_meters", "duration_seconds",
               "avg_pace_seconds_per_km", "name", "waypoints", "weather_json", "route_summary",
               "route_thumbnail", "note", "feel", "body_tags", "weather_feel", "music", "mid_run_notes"]
OWNED_GEAR_COLUMNS = ["gear_id", "name", "kind", "color", "retired"]
GEAR_STATS_COLUMNS = ["id", "name", "kind", "color", "retired", "created_at", "run_count", "rated_count", "avg_comfort"]


def run_row(**overrides):
    row = dict(zip(RUN_COLUMNS, ["run-1", "user-1", None, None, 5000, 1500, 300.0, "Run", "[]",
                                 None, "Run", "[]", None, None, [], [], None, "[]"]))
    row.update(overrides)
    return tuple(row[c] for c in RUN_COLUMNS)


AUTH = ("gid", "e@x.com", "Name")


@patch("function_app.require_auth", return_value=AUTH)
@patch("function_app.get_or_create_user", return_value={"id": "user-1"})
@patch("function_app.compute_and_upsert_badges", return_value=[])
@patch("function_app.build_route_summary", return_value="Loop around Green Lake")
@patch("function_app.fetch_weather", return_value={"temp_f": 52, "condition": "Overcast", "icon": "cloudy"})
@patch("function_app.get_conn")
class TestCreateRunFeel(unittest.TestCase):
    waypoints = [{"lat": 47.68, "lng": -122.34, "ts": 0}, {"lat": 47.681, "lng": -122.34, "ts": 1}]

    def body(self, **extra):
        return {"distance_meters": 5000, "duration_seconds": 1500, "waypoints": self.waypoints, **extra}

    def test_stores_feel_fields_and_gear(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("FROM gear WHERE user_id", (OWNED_GEAR_COLUMNS, [("g-shoe", "Pegasus", "shoe", "a1", False)])),
            ("INSERT INTO runs (", (RUN_COLUMNS, [run_row()])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.create_run(scripted_request(self.body(
            feel=5, body_tags=["fresh_legs"], weather_feel=["just_right"],
            music={"kind": "album", "title": "Currents", "by": "Tame Impala", "helped": "pushed"},
            mid_run_notes=[{"kind": "great_song", "elapsed_s": 75}], note="Clicked.",
            gear=[{"gear_id": "g-shoe", "comfort": 3, "note": "great"}],
        )))

        self.assertEqual(resp.status_code, 201)
        insert = conn.ran("INSERT INTO runs (")[0]
        # note, feel, body_tags, weather_feel, music, mid_run_notes follow the 11 original columns.
        self.assertEqual(insert[11:13], ("Clicked.", 5))
        self.assertEqual(insert[13], ["fresh_legs"])
        self.assertEqual(insert[14], ["just_right"])
        self.assertEqual(json.loads(insert[15])["title"], "Currents")
        self.assertEqual(json.loads(insert[16]), [{"kind": "great_song", "elapsed_s": 75}])
        self.assertEqual(conn.ran("INSERT INTO run_gear"), [("run-1", "g-shoe", 3, "great")])
        self.assertEqual(conn.ran("FROM gear WHERE user_id")[0][0], "user-1")
        body = json.loads(resp.get_body())
        self.assertEqual(body["feel"], 5)
        self.assertEqual(body["gear"], [{"gear_id": "g-shoe", "name": "Pegasus", "kind": "shoe", "color": "a1",
                                         "retired": False, "comfort": 3, "note": "great"}])

    def test_rejects_gear_owned_by_someone_else(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("FROM gear WHERE user_id", (OWNED_GEAR_COLUMNS, [])),
            ("INSERT INTO runs (", (RUN_COLUMNS, [run_row()])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.create_run(scripted_request(self.body(gear=[{"gear_id": "g-theirs", "comfort": 2}])))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("isn't yours", json.loads(resp.get_body())["error"])
        self.assertEqual(conn.ran("INSERT INTO runs ("), [])
        self.assertEqual(conn.commits, 0)

    def test_validation_failure_never_touches_the_database(self, mock_get_conn, *_):
        resp = function_app.create_run(scripted_request(self.body(feel=9)))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("feel", json.loads(resp.get_body())["error"])
        mock_get_conn.assert_not_called()

    def test_run_without_feel_fields_still_saves(self, mock_get_conn, *_):
        conn = ScriptedConn([("INSERT INTO runs (", (RUN_COLUMNS, [run_row()]))])
        mock_get_conn.return_value = conn
        resp = function_app.create_run(scripted_request(self.body()))
        self.assertEqual(resp.status_code, 201)
        insert = conn.ran("INSERT INTO runs (")[0]
        self.assertEqual(insert[11:], (None, None, [], [], None, "[]"))
        self.assertEqual(conn.ran("FROM gear WHERE user_id"), [])
        self.assertEqual(conn.ran("run_gear"), [])
        self.assertEqual(json.loads(resp.get_body())["gear"], [])

    def test_non_object_body_is_400(self, mock_get_conn, *_):
        resp = function_app.create_run(scripted_request([1, 2]))
        self.assertEqual(resp.status_code, 400)


@patch("function_app.require_auth", return_value=AUTH)
@patch("function_app.get_or_create_user", return_value={"id": "user-1"})
@patch("function_app.get_conn")
class TestReadRunsWithFeel(unittest.TestCase):
    gear_json = '[{"gear_id": "g1", "name": "Pegasus", "kind": "shoe", "color": "a1", "retired": false, "comfort": 3, "note": null}]'

    def test_list_includes_feel_music_and_gear(self, mock_get_conn, *_):
        cols = ["id", "route_summary", "weather_json", "route_thumbnail", "feel", "body_tags", "weather_feel", "music", "gear"]
        rows = [
            ("run-1", "Loop", None, "[]", 4, ["fresh_legs"], ["windy"], '{"kind": "album", "title": "Currents"}', self.gear_json),
            ("run-0", "Run", None, "[]", None, [], [], None, "[]"),
        ]
        conn = ScriptedConn([("FROM runs WHERE user_id", (cols, rows))])
        mock_get_conn.return_value = conn
        resp = function_app.list_runs(scripted_request())
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.get_body())
        self.assertEqual(body[0]["music"], {"kind": "album", "title": "Currents"})
        self.assertEqual(body[0]["gear"][0]["name"], "Pegasus")
        self.assertEqual(body[0]["weather_feel"], ["windy"])
        self.assertIsNone(body[1]["feel"])
        self.assertEqual(body[1]["gear"], [])
        self.assertIn("run_gear", conn.queries[0][0])

    def test_detail_includes_gear_and_mid_run_notes(self, mock_get_conn, *_):
        cols = RUN_COLUMNS + ["gear"]
        row = run_row(feel=2, mid_run_notes='[{"kind": "hurting", "elapsed_s": 900}]') + (self.gear_json,)
        conn = ScriptedConn([
            ("FROM runs WHERE id", (cols, [row])),
            ("SELECT badge_type", (["badge_type"], [])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.get_run(scripted_request(run_id="run-1"))
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.get_body())
        self.assertEqual(body["feel"], 2)
        self.assertEqual(body["mid_run_notes"], [{"kind": "hurting", "elapsed_s": 900}])
        self.assertEqual(body["gear"][0]["comfort"], 3)


@patch("function_app.require_auth", return_value=AUTH)
@patch("function_app.get_or_create_user", return_value={"id": "user-1"})
@patch("function_app.get_conn")
class TestUpdateRunFeel(unittest.TestCase):
    def test_updates_feel_tags_and_music(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("UPDATE runs SET", (RUN_COLUMNS + ["gear"], [run_row(feel=3) + ("[]",)])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.update_run(scripted_request(
            {"feel": 3, "body_tags": ["heavy_legs"], "music": {"kind": "podcast", "title": "Radiolab"}},
            run_id="run-1",
        ))
        self.assertEqual(resp.status_code, 200)
        query, params = conn.queries[0]
        self.assertIn("feel = %s", query)
        self.assertIn("body_tags = %s::text[]", query)
        self.assertIn("music = %s", query)
        self.assertNotIn("note =", query)
        self.assertEqual(params[0], 3)
        self.assertEqual(params[1], ["heavy_legs"])
        self.assertEqual(json.loads(params[2])["kind"], "podcast")
        self.assertEqual(params[-2:], ("run-1", "user-1"))
        self.assertEqual(conn.ran("run_gear ("), [])
        self.assertEqual(json.loads(resp.get_body())["feel"], 3)

    def test_replaces_gear_after_checking_run_and_gear_ownership(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("SELECT id FROM runs WHERE id", (["id"], [("run-1",)])),
            ("FROM gear WHERE user_id", (OWNED_GEAR_COLUMNS, [("g1", "Tee", "top", "a3", False)])),
            ("UPDATE runs SET", (RUN_COLUMNS + ["gear"], [run_row() + ("[]",)])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.update_run(scripted_request({"gear": [{"gear_id": "g1", "comfort": 1, "note": "chafed"}]}, run_id="run-1"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(conn.ran("DELETE FROM run_gear"), [("run-1",)])
        self.assertEqual(conn.ran("INSERT INTO run_gear"), [("run-1", "g1", 1, "chafed")])
        update_query = [q for q, _ in conn.queries if q.startswith("UPDATE runs")][0]
        self.assertIn("SET id = id", update_query)
        self.assertEqual(conn.commits, 1)

    def test_foreign_gear_is_rejected_before_any_write(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("SELECT id FROM runs WHERE id", (["id"], [("run-1",)])),
            ("FROM gear WHERE user_id", (OWNED_GEAR_COLUMNS, [])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.update_run(scripted_request({"gear": [{"gear_id": "g-theirs"}]}, run_id="run-1"))
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(conn.ran("DELETE FROM run_gear"), [])
        self.assertEqual(conn.commits, 0)

    def test_gear_update_on_someone_elses_run_is_404(self, mock_get_conn, *_):
        conn = ScriptedConn([("SELECT id FROM runs WHERE id", (["id"], []))])
        mock_get_conn.return_value = conn
        resp = function_app.update_run(scripted_request({"gear": []}, run_id="run-x"))
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(conn.ran("run_gear"), [])

    def test_invalid_field_is_400(self, mock_get_conn, *_):
        resp = function_app.update_run(scripted_request({"weather_feel": ["balmy"]}, run_id="run-1"))
        self.assertEqual(resp.status_code, 400)
        mock_get_conn.assert_not_called()


@patch("function_app.require_auth", return_value=AUTH)
@patch("function_app.get_or_create_user", return_value={"id": "user-1"})
@patch("function_app.get_conn")
class TestGearRoutes(unittest.TestCase):
    stats_row = ("g1", "Pegasus", "shoe", "a1", False, None, 4, 3, 2.67)

    def test_list_gear_returns_stats_for_current_user(self, mock_get_conn, *_):
        conn = ScriptedConn([("FROM gear g LEFT JOIN run_gear", (GEAR_STATS_COLUMNS, [self.stats_row]))])
        mock_get_conn.return_value = conn
        resp = function_app.list_gear(scripted_request())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(json.loads(resp.get_body())[0]["avg_comfort"], 2.67)
        self.assertEqual(conn.queries[0][1], ("user-1",))

    def test_create_gear(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("INSERT INTO gear", (["id"], [("g1",)])),
            ("FROM gear g LEFT JOIN run_gear", (GEAR_STATS_COLUMNS, [("g1", "Pegasus", "shoe", "a1", False, None, 0, 0, None)])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.create_gear(scripted_request({"name": "Pegasus", "kind": "shoe", "color": "a1"}))
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(conn.ran("INSERT INTO gear")[0], ("user-1", "Pegasus", "shoe", "a1"))
        self.assertEqual(json.loads(resp.get_body())["run_count"], 0)

    def test_create_gear_validation_failure(self, mock_get_conn, *_):
        resp = function_app.create_gear(scripted_request({"name": "Pegasus", "kind": "boot", "color": "a1"}))
        self.assertEqual(resp.status_code, 400)
        mock_get_conn.assert_not_called()

    def test_retire_gear(self, mock_get_conn, *_):
        conn = ScriptedConn([
            ("UPDATE gear SET", (["id"], [("g1",)])),
            ("FROM gear g LEFT JOIN run_gear", (GEAR_STATS_COLUMNS, [self.stats_row[:4] + (True,) + self.stats_row[5:]])),
        ])
        mock_get_conn.return_value = conn
        resp = function_app.update_gear(scripted_request({"retired": True}, gear_id="g1"))
        self.assertEqual(resp.status_code, 200)
        query, params = conn.queries[0]
        self.assertIn("retired = %s", query)
        self.assertIn("user_id = %s", query)
        self.assertEqual(params, (True, "g1", "user-1"))
        self.assertTrue(json.loads(resp.get_body())["retired"])

    def test_update_someone_elses_gear_is_404(self, mock_get_conn, *_):
        conn = ScriptedConn([("UPDATE gear SET", (["id"], []))])
        mock_get_conn.return_value = conn
        resp = function_app.update_gear(scripted_request({"name": "Mine now"}, gear_id="g-theirs"))
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(conn.commits, 0)

    def test_update_with_nothing_to_change_is_400(self, mock_get_conn, *_):
        resp = function_app.update_gear(scripted_request({}, gear_id="g1"))
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_is_401(self, mock_get_conn, mock_get_user, mock_auth):
        mock_auth.return_value = None
        for handler, req in ((function_app.list_gear, scripted_request()),
                             (function_app.create_gear, scripted_request({})),
                             (function_app.update_gear, scripted_request({}, gear_id="g1"))):
            self.assertEqual(handler(req).status_code, 401)
        mock_get_conn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
