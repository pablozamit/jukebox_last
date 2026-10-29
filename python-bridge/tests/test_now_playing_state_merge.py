"""Regression test for preserving watchdog-owned fields during playback updates.

The real bridge module initializes Firebase at import time, so this test extracts
the production coroutine and supplies in-memory fakes. It never starts Firebase
or connects to Kodi.
"""
import ast
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import time
import unittest
import uuid


BRIDGE_SOURCE = Path(__file__).resolve().parents[1] / "bridge.py"


class _Document:
    def __init__(self, data=None):
        self.data = dict(data or {})

    def set(self, data, merge=False):
        if merge:
            self.data.update(data)
        else:
            self.data = dict(data)

    def get(self):
        return _Snapshot(self.data)


class _Snapshot:
    def __init__(self, data):
        self.exists = bool(data)
        self._data = dict(data)

    def to_dict(self):
        return dict(self._data)


class _Collection:
    def __init__(self, name, documents):
        self.name = name
        self.documents = documents

    def document(self, name):
        return self.documents.setdefault((self.name, name), _Document())


class _Database:
    def __init__(self, now_playing):
        self.documents = {("state", "nowPlaying"): _Document(now_playing)}

    def collection(self, name):
        return _Collection(name, self.documents)


class _Outbox:
    def put(self, *args, **kwargs):
        pass

    def update(self, *args, **kwargs):
        pass


class _Firestore:
    class Increment:
        def __init__(self, amount):
            self.amount = amount


class NowPlayingMergeTests(unittest.IsolatedAsyncioTestCase):
    async def test_playback_update_preserves_watchdog_session_fields(self):
        tree = ast.parse(BRIDGE_SOURCE.read_text(encoding="utf-8"))
        function = next(
            node for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "_play_song_on_kodi"
        )

        state = {
            "lastResetDate": "2026-10-28T02:00:00+01:00",
            "sessionStart": 1793149200000,
            "queue": ["song.mp4"],
        }
        database = _Database(state)
        namespace = {
            "asyncio": asyncio,
            "datetime": datetime,
            "timezone": timezone,
            "uuid": uuid,
            "json": json,
            "time": time,
            "logger": logging.getLogger("test-now-playing-merge"),
            "safe_video_path": lambda filename: Path(filename),
            "social_session_id": lambda occurred_at: "test-session",
            "utc_iso": lambda occurred_at: occurred_at.isoformat(),
            "capture_playback_attribution_bounded": lambda filename: None,
            "SOCIAL_OUTBOX": _Outbox(),
            "pending_kodi_requests": {},
            "capture_unused": None,
            "certified_playback_attribution": lambda attribution: attribution,
            "playback_events": lambda **kwargs: [],
            "update_social_song_peak": lambda *args: None,
            "flush_social_outbox": lambda: None,
            "reset_song_and_tokens": lambda *args: asyncio.sleep(0),
            "db": database,
            "clean_title": lambda filename: filename,
            "PROGRESS_STATE": {},
            "firestore": _Firestore,
            "report_error": lambda *args: None,
        }
        # Both attribution captures are async in production.
        async def capture_attribution(filename):
            return None

        namespace["capture_playback_attribution_bounded"] = capture_attribution
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(BRIDGE_SOURCE), "exec"), namespace)

        class FakeKodiSocket:
            async def send(self, raw_payload):
                command_id = json.loads(raw_payload)["id"]
                namespace["pending_kodi_requests"][command_id].set_result({"result": "OK"})

        playing = [None]
        self.assertTrue(await namespace["_play_song_on_kodi"](FakeKodiSocket(), "song.mp4", playing))

        resulting_state = database.documents[("state", "nowPlaying")].data
        self.assertEqual(resulting_state["lastResetDate"], state["lastResetDate"])
        self.assertEqual(resulting_state["sessionStart"], state["sessionStart"])
        self.assertEqual(resulting_state["queue"], state["queue"])


if __name__ == "__main__":
    unittest.main()
