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


if __name__ == "__main__":
    unittest.main()
