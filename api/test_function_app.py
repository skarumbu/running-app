import json
import os
import sys
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from function_app import (
    weather_code_to_condition,
    downsample_waypoints,
    classify_route_shape,
    _haversine_m,
    fetch_weather,
    reverse_geocode_place,
    build_route_summary,
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


if __name__ == "__main__":
    unittest.main()
