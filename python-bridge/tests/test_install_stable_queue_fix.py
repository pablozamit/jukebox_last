"""Offline regression coverage for the exact, guarded queue-fix generator."""
import ast
import asyncio
import hashlib
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

import install_stable_queue_fix as installer


# Compact, safe fixture containing only the stable installer anchors and affected functions.
BASELINE = '''BRIDGE_VERSION = "2.3.0+logs.1"
async def clear_all_data(session_start=None):
    try:
        print(" [SISTEMA] ¡Base de datos reseteada para la nueva sesión!")
    except Exception as e:
        report_error("Error en limpieza total", e)

async def check_for_new_session():
    now = datetime.now()
    state_doc = db.collection('state').document('nowPlaying').get()
    state = state_doc.to_dict() if state_doc.exists else {}
    marker = state.get('lastResetDate')
    try:
        last_reset = datetime.fromisoformat(marker) if marker else None
    except ValueError:
        last_reset = None
    if not last_reset and now.hour >= 2:
        await clear_all_data(session_start_ms(now))
        db.collection('state').document('nowPlaying').set({'lastResetDate': now.isoformat()}, merge=True)

async def _play_song_on_kodi(filename):
    db.collection('state').document('nowPlaying').set({
        'songId': filename,
        'lastActive': int(time.time() * 1000)
    })
    PROGRESS_STATE['file'] = filename

async def main():
    db.collection('state').document('nowPlaying').set({
        'songId': 'current',
        'lastActive': now_ms
    }, merge=True)
'''


def _build_patched_fixture():
    with patch.object(installer, 'STABLE_LOGS_SHA256', hashlib.sha256(BASELINE.encode()).hexdigest()):
        return installer.patched_source(BASELINE.encode()).decode()


def _function(source, name):
    tree = ast.parse(source)
    return next(node for node in tree.body
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name)


class _Document:
    def __init__(self, data=None):
        self.data = dict(data or {})
        self.calls = []

    def get(self):
        return type("Snapshot", (), {"exists": True, "to_dict": lambda _: dict(self.data)})()

    def set(self, data, merge=False):
        self.calls.append((dict(data), merge))
        if merge:
            self.data.update(data)
        else:
            self.data = dict(data)


class _DB:
    def __init__(self, state):
        self.state = state

    def collection(self, name):
        return type("Collection", (), {"document": lambda _, doc: self.state})()


def _run_check(source, marker, now, clear_result=True):
    state = _Document({"queue": ["keep.mp4"], "tokens": ["dj1"], "lastResetDate": marker})
    clear = AsyncMock(return_value=clear_result)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(now.year, now.month, now.day, now.hour, now.minute, tzinfo=tz)

    def local_session_start(dt):
        # The real stable helper compares now against a naive local boundary.
        boundary = datetime(dt.year, dt.month, dt.day, 2)
        _ = dt < boundary
        return int(dt.timestamp() * 1000)

    namespace = {
        "datetime": FixedDateTime, "time": type("Time", (), {"time": staticmethod(lambda: 1000)}),
        "db": _DB(state), "SESSION_STATE": {"start": None}, "SESSION_USER_IDS": set(),
        "session_start_ms": local_session_start, "clear_all_data": clear,
        "logger": Mock(), "report_error": Mock(), "print": lambda *_: None,
    }
    check = _function(source, "check_for_new_session")
    exec(compile(ast.Module(body=[check], type_ignores=[]), "fixture.py", "exec"), namespace)
    asyncio.run(namespace["check_for_new_session"]())
    return state, clear, namespace


class StableQueueFixTests(unittest.TestCase):
    def setUp(self):
        self.patched = _build_patched_fixture()

    def test_unknown_source_is_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.py"
            path.write_text("print('other bridge')\n", encoding="utf-8")
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "verified stable"):
                installer.install(directory)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual([item.name for item in Path(directory).iterdir()], ["bridge.py"])

    def test_old_missing_marker_behavior_reproduces_reset_at_1945(self):
        old = _run_check(BASELINE, None, datetime(2026, 11, 2, 19, 45))[1]
        self.assertEqual(old.await_count, 1)

    def test_missing_or_invalid_marker_at_any_hour_preserves_live_data(self):
        for marker in (None, "not-a-date", 123):
            for hour in (1, 19):
                with self.subTest(marker=marker, hour=hour):
                    state, clear, namespace = _run_check(
                        self.patched, marker, datetime(2026, 11, 2, hour, 45))
                    self.assertEqual(state.data["queue"], ["keep.mp4"])
                    self.assertEqual(state.data["tokens"], ["dj1"])
                    self.assertTrue(state.data["lastResetDate"])
                    self.assertEqual(state.calls[-1][1], True)
                    clear.assert_not_awaited()
                    self.assertEqual(namespace["SESSION_STATE"]["start"], state.data["sessionStart"])

    def test_valid_old_marker_resets_once_then_stays_current(self):
        state = _Document({"lastResetDate": "2026-11-01T01:00:00", "queue": ["old"]})
        clear = AsyncMock(return_value=True)
        now = datetime(2026, 11, 2, 2, 5)
        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(now.year, now.month, now.day, now.hour, now.minute, tzinfo=tz)
        namespace = {"datetime": FixedDateTime, "time": type("Time", (), {"time": staticmethod(lambda: 1000)}),
                     "db": _DB(state), "SESSION_STATE": {"start": None}, "SESSION_USER_IDS": set(),
                     "session_start_ms": lambda dt: int(dt.timestamp() * 1000), "clear_all_data": clear,
                     "logger": Mock(), "report_error": Mock(), "print": lambda *_: None}
        check = _function(self.patched, "check_for_new_session")
        exec(compile(ast.Module(body=[check], type_ignores=[]), "fixture.py", "exec"), namespace)
        asyncio.run(namespace["check_for_new_session"]())
        self.assertEqual(clear.await_count, 1)
        self.assertEqual(state.data["queue"], ["old"])
        asyncio.run(namespace["check_for_new_session"]())
        self.assertEqual(clear.await_count, 1)

    def test_timezone_aware_marker_is_normalized_before_local_session_calculation(self):
        state, clear, namespace = _run_check(
            self.patched, "2026-11-02T12:00:00+01:00", datetime(2026, 11, 2, 12, 5))
        clear.assert_not_awaited()
        self.assertEqual(state.data["lastResetDate"], "2026-11-02T12:00:00+01:00")
        namespace['report_error'].assert_not_called()

    def test_valid_marker_respects_before_and_after_0200_boundary(self):
        for marker, now, expected in (
            ('2026-11-01T19:00:00', datetime(2026, 11, 2, 1, 59), 0),
            ('2026-11-01T19:00:00', datetime(2026, 11, 2, 2, 0), 1),
            ('2026-11-02T01:00:00', datetime(2026, 11, 2, 2, 0), 1),
            ('2026-11-02T02:00:00', datetime(2026, 11, 2, 19, 45), 0),
        ):
            with self.subTest(marker=marker, now=now):
                _, clear, namespace = _run_check(self.patched, marker, now)
                self.assertEqual(clear.await_count, expected)
                namespace['report_error'].assert_not_called()

    def test_failed_cleanup_does_not_stamp_marker(self):
        state, clear, _ = _run_check(
            self.patched, "2026-11-01T01:00:00", datetime(2026, 11, 2, 2, 5), clear_result=False)
        clear.assert_awaited_once()
        self.assertEqual(state.data["lastResetDate"], "2026-11-01T01:00:00")
        self.assertEqual(state.data["queue"], ["keep.mp4"])

    def test_playback_and_progress_writes_use_merge(self):
        state = _Document({"lastResetDate": "keep-marker", "sessionStart": 123})
        namespace = {"db": _DB(state), "time": SimpleNamespace(time=lambda: 10), "now_ms": 20,
                     "asyncio": asyncio, "PROGRESS_STATE": {}}
        for name in ("_play_song_on_kodi", "main"):
            node = _function(self.patched, name)
            sets = [call for call in ast.walk(node)
                    if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
                    and call.func.attr == "set"]
            self.assertEqual(len(sets), 1)
            self.assertTrue(any(keyword.arg == "merge" and isinstance(keyword.value, ast.Constant)
                                and keyword.value.value is True for keyword in sets[0].keywords))
            exec(compile(ast.Module(body=[node], type_ignores=[]), "fixture.py", "exec"), namespace)
            if name == "_play_song_on_kodi":
                asyncio.run(namespace[name]("played.mp4"))
            else:
                asyncio.run(namespace[name]())
            self.assertEqual(state.data["lastResetDate"], "keep-marker")
            self.assertEqual(state.data["sessionStart"], 123)


if __name__ == "__main__":
    unittest.main()
